// sidegig background worker: routes messages, opens apps, keeps network rules,
// menus, alarms and badges in sync with settings.
import { ext, features, TARGET, uid } from '../shared/api.ts';
import { loadSettings, saveSettings, getLocal, setLocal, onSettingsChanged } from '../shared/storage.ts';
import { appFromCatalog, defaultSettings } from '../shared/defaults.ts';
import { catalogById } from '../shared/catalog.ts';
import { buildPrompt } from '../shared/prompt.ts';
import { findRule, matchPattern, isRestricted } from '../shared/rules.ts';
import { badgeLabel } from '../shared/badge.ts';
import type { AppEntry, PendingPrompt, Settings } from '../shared/types.ts';
import type { ToBackground, ToContent } from '../shared/messages.ts';
import { applyRules, setDrawerTabs, setSideTabs } from './dnr.ts';
import { pageCookies } from './framecookies.ts';
import { openApp, openPanel, openMiniWindow, forgetPopup, rememberSideWidth } from './open.ts';
import { refreshStatus } from './status.ts';
import { saveWorkspace, restoreWorkspace, sleepTabs } from './workspaces.ts';
import { buildEdition, scheduleEdition, buildIfStale, importFromAi, saveLink } from './edition.ts';
import { trackPanels } from './panels.ts';
import { trustSender } from './trust.ts';
import { checkFavicons } from './favicons.ts';
import { findCollection, readPool, refreshPool, REFRESH_MS } from '../shared/collect.ts';

trackPanels();

let cache: Settings | null = null;
const now = () => cache ?? defaultSettings();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};

function aiApp(s: Settings): AppEntry | undefined {
  const id = s.ai.defaultApp;
  return s.apps.find((a) => a.id === id) ?? (catalogById(id) ? appFromCatalog(id) : undefined);
}

// ---------------------------------------------------------------- sync

async function sync(): Promise<void> {
  cache = await loadSettings();
  void checkFavicons(cache.apps);
  await setSideTabs(await getLocal<number[]>('sideTabs', [])).catch(() => undefined);
  await setDrawerTabs(await getLocal<number[]>('drawerTabs', [])).catch(() => undefined);
  await Promise.allSettled([applyRules(cache.apps), setupMenus(cache), registerBridge(cache), setupAlarms(cache), scheduleEdition(cache)]);
  void buildIfStale(cache);
  setupActionBehavior();
  setupLinkRules();
}

function setupActionBehavior() {
  const sp = (ext as any).sidePanel;
  if (sp?.setPanelBehavior) sp.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

async function setupMenus(s: Settings) {
  const menus = (ext as any).contextMenus ?? (ext as any).menus;
  if (!menus) return;
  await menus.removeAll();
  const ai = aiApp(s)?.name ?? 'AI';
  menus.create({ id: 'ask-selection', title: `Ask ${ai} about "%s"`, contexts: ['selection'] });
  menus.create({ id: 'ask-page', title: `Ask ${ai} about this page`, contexts: ['page'] });
  menus.create({ id: 'ask-assistant', title: 'Ask the sidegig Assistant about "%s"', contexts: ['selection'] });
  menus.create({ id: 'add-stack', title: 'Add to sidegig stacks', contexts: ['page', 'link'] });
  menus.create({ id: 'link-window', title: 'Open link in a sidegig mini window', contexts: ['link'] });
  if (s.edition.enabled) menus.create({ id: 'save-edition', title: 'Save to your reading list', contexts: ['page', 'link'] });
}

async function registerBridge(s: Settings) {
  const sc = (ext as any).scripting;
  if (!sc?.registerContentScripts) return;
  const hosts = [...new Set(s.apps.filter((a) => !a.catalogId).map((a) => hostOf(a.url)).filter(Boolean))];
  const existing = await sc.getRegisteredContentScripts({ ids: ['bridge-custom'] }).catch(() => []);
  if (existing.length) await sc.unregisterContentScripts({ ids: ['bridge-custom'] });
  if (!hosts.length) return;
  await sc.registerContentScripts([
    { id: 'bridge-custom', matches: hosts.map((h) => `https://${h}/*`), js: ['bridge.js'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true },
  ]);
}

async function setupAlarms(s: Settings) {
  const anyStatus = s.status.github || s.status.vercel || s.status.gmail;
  await ext.alarms.clear('status');
  if (anyStatus) {
    ext.alarms.create('status', { periodInMinutes: Math.max(1, s.status.intervalMin), delayInMinutes: 0.05 });
  } else {
    await setLocal('status', []);
  }
  await ext.alarms.clear('sleep');
  if (s.sleep.enabled) ext.alarms.create('sleep', { periodInMinutes: 10 });
  // Wallpaper collections refresh on their own; app icons get rechecked as the browser learns them.
  if (s.newtab.background.kind === 'collection') {
    if (!(await ext.alarms.get('walls'))) ext.alarms.create('walls', { periodInMinutes: 180, delayInMinutes: 1 });
  } else await ext.alarms.clear('walls');
  if (!(await ext.alarms.get('favicons'))) ext.alarms.create('favicons', { periodInMinutes: 360, delayInMinutes: 0.2 });
}

async function refreshWalls() {
  const s = now();
  const bg = s.newtab.background;
  if (bg.kind !== 'collection') return;
  const c = findCollection(bg.ref, s.newtab.collections);
  if (!c) return;
  const pool = await readPool(c.id);
  if (!pool || Date.now() - pool.at > REFRESH_MS) await refreshPool(c).catch(() => undefined);
}

// ---------------------------------------------------------------- AI hand-off

let claimChain: Promise<unknown> = Promise.resolve();

async function storePending(app: AppEntry, text: string, autoSend: boolean) {
  const p: PendingPrompt = { id: uid('p_'), appId: app.id, host: hostOf(app.url), text, autoSend, created: Date.now() };
  await setLocal('aiPending', p);
}

function claim(host: string): Promise<PendingPrompt | null> {
  // Serialize claims so only one frame ever gets a prompt.
  const run = claimChain.then(async () => {
    const p = await getLocal<PendingPrompt | null>('aiPending', null);
    if (!p || p.host !== host || Date.now() - p.created > 90_000) return null;
    await setLocal('aiPending', null);
    return p;
  });
  claimChain = run.catch(() => undefined);
  return run;
}

function askFromBackground(tab: chrome.tabs.Tab, selection?: string, open = true) {
  const s = now();
  const app = aiApp(s);
  if (!app) return;
  if (open) openApp({ appId: app.id, url: app.url, openIn: app.openIn === 'drawer' ? 'panel' : app.openIn, side: s.rail.side }, tab.windowId);
  void (async () => {
    let text = selection ?? '';
    let title = tab.title ?? '';
    let url = tab.url ?? '';
    if (!selection && tab.id !== undefined && !isRestricted(url)) {
      try {
        const r = await ext.tabs.sendMessage(tab.id, { type: 'extract' });
        ({ text, title, url } = r);
      } catch {
        /* no rail on this page */
      }
    }
    const template = selection ? s.ai.selectionTemplate : s.ai.pageTemplate;
    await storePending(app, buildPrompt({ template, text, title, url, maxChars: s.ai.maxChars }), s.ai.autoSend);
  })();
}

// ---------------------------------------------------------------- badges

async function onBadge(host: string, count: number) {
  const s = now();
  const ids = s.apps.filter((a) => a.badge && hostOf(a.url) === host).map((a) => a.id);
  if (!ids.length) return;
  const badges = await getLocal<Record<string, number>>('badges', {});
  let changed = false;
  for (const id of ids) {
    if (badges[id] !== count) {
      badges[id] = count;
      changed = true;
    }
  }
  if (!changed) return;
  await setLocal('badges', badges);
  const total = Object.values(badges).reduce((n, c) => n + Math.max(0, c), 0);
  const action = (ext as any).action;
  action?.setBadgeText?.({ text: total ? badgeLabel(total) : '' });
  action?.setBadgeBackgroundColor?.({ color: '#e5484d' });
}

// ---------------------------------------------------------------- link rules

let linkRulesWired = false;
function setupLinkRules() {
  const wn = (ext as any).webNavigation;
  if (linkRulesWired || !wn?.onCreatedNavigationTarget) return;
  linkRulesWired = true;
  wn.onCreatedNavigationTarget.addListener(async (d: { tabId: number; url: string }) => {
    const s = now();
    const rule = findRule(s.rules, d.url);
    if (!rule) return;
    if (rule.action === 'sidebar') {
      // The browser opens its sidebar only on a click, so this uses one that is already open.
      const app = s.apps.find((a) => matchPattern(hostOf(a.url).replace(/^www\./, ''), d.url));
      const tab = await ext.tabs.get(d.tabId).catch(() => undefined);
      const panels = await getLocal<Record<string, { ts: number }>>('panelOpen', {});
      const open = tab?.windowId !== undefined && Date.now() - (panels[String(tab.windowId)]?.ts ?? 0) < 40_000;
      if (app && open) {
        await setLocal('panelRequest', { appId: app.id, url: d.url, ts: Date.now() });
        await ext.tabs.remove(d.tabId).catch(() => undefined);
        return;
      }
    }
    if (rule.action === 'window' || rule.action === 'sidebar') {
      await openMiniWindow({ url: d.url, openIn: 'window', side: s.rail.side });
      await ext.tabs.remove(d.tabId).catch(() => undefined);
      return;
    }
    const tabs = await ext.tabs.query({});
    const existing = tabs.find((t) => t.id !== d.tabId && t.url && matchPattern(rule.pattern, t.url));
    if (existing?.id !== undefined) {
      await ext.tabs.update(existing.id, { url: d.url, active: true });
      if (existing.windowId !== undefined) await ext.windows.update(existing.windowId, { focused: true });
      await ext.tabs.remove(d.tabId).catch(() => undefined);
    }
  });
}

// ---------------------------------------------------------------- stacks

async function addToStacks(url: string, title: string) {
  const s = now();
  const parentId = s.stacks.activeSpace || s.stacks.spaces[0] || (await defaultSpaceId());
  await ext.bookmarks.create({ parentId, url, title: title || url });
}

export async function defaultSpaceId(): Promise<string> {
  const [tree] = await ext.bookmarks.getTree();
  return tree.children?.[0]?.id ?? '1';
}

// ---------------------------------------------------------------- listeners (registered synchronously)

ext.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const stored = await (ext.storage.sync ?? ext.storage.local).get('settings');
    if (!(stored as any).settings) {
      const fresh = defaultSettings();
      // Start the rail on the side this browser opens its sidebar, so apps open right beside it.
      const layout = await (ext as any).sidePanel?.getLayout?.().catch(() => null);
      if (layout?.side === 'left' || layout?.side === 'right') fresh.rail.side = layout.side;
      await saveSettings(fresh);
    }
    await ext.tabs.create({ url: ext.runtime.getURL('options.html#welcome') });
  }
  await sync();
});

// Tabs whose in-page drawer shows apps (see dnr.ts); tab ids restart with the browser.
async function drawerTab(id: number, open: boolean) {
  const ids = (await getLocal<number[]>('drawerTabs', [])).filter((t) => t !== id);
  if (open) ids.push(id);
  await setLocal('drawerTabs', ids);
  await setDrawerTabs(ids);
}
ext.tabs.onRemoved.addListener((id) => void drawerTab(id, false));

ext.runtime.onStartup?.addListener(() => {
  void setLocal('panelOpen', {});
  void setLocal('drawerTabs', []);
  void sync();
});
onSettingsChanged(() => void sync());
(ext as any).permissions?.onAdded?.addListener(() => setupLinkRules());
ext.windows.onRemoved.addListener((id) => void forgetPopup(id));
(ext.windows as any).onBoundsChanged?.addListener((w: chrome.windows.Window) => void rememberSideWidth(w));

const OUR_ORIGIN = new URL(ext.runtime.getURL('/')).origin;

ext.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
  const { ok, host } = trustSender(msg?.type, sender, ext.runtime.id, OUR_ORIGIN);
  if (!ok) return false;
  const windowId = sender.tab?.windowId;
  switch (msg.type) {
    case 'open-app':
      openApp({ appId: msg.appId, url: msg.url, openIn: msg.openIn, side: msg.side }, windowId);
      return false;
    case 'ask-ai': {
      const app = now().apps.find((a) => a.id === msg.appId) ?? (catalogById(msg.appId) ? appFromCatalog(msg.appId) : undefined);
      if (app) void storePending(app, msg.prompt, msg.autoSend);
      openApp({ appId: msg.appId, url: msg.url, openIn: msg.openIn === 'drawer' ? 'panel' : msg.openIn, side: msg.side }, windowId);
      return false;
    }
    case 'badge':
      void onBadge(host, msg.count);
      return false;
    case 'ai-claim':
      claim(host).then(sendResponse);
      return true;
    case 'ask-page':
      // The caller (panel / new tab) opens the AI app itself; we just prepare the prompt.
      void ext.tabs.query({ active: true, lastFocusedWindow: true }).then(([t]) => t && askFromBackground(t, undefined, false));
      return false;
    case 'frame-cookies':
      void pageCookies(`https://${host}/`).then(sendResponse, () => sendResponse(''));
      return true;
    case 'clear-sw': {
      // A site's service worker answers with "don't frame me" headers that network
      // rules can't reach; remove it before the sidebar loads the site (it comes
      // back the next time you use the site in a tab).
      let origin = '';
      try {
        origin = new URL(msg.url).origin;
      } catch {
        sendResponse(false);
        return false;
      }
      const bd = (ext as any).browsingData;
      if (!bd?.remove || !/^https:/.test(origin)) {
        sendResponse(false);
        return false;
      }
      bd.remove({ origins: [origin] }, { serviceWorkers: true }).then(
        () => sendResponse(true),
        () => sendResponse(false),
      );
      return true;
    }
    case 'drawer-frames':
      if (sender.tab?.id !== undefined) void drawerTab(sender.tab.id, true);
      return false;
    case 'tab-info': {
      const wid = sender.tab?.windowId;
      if (wid === undefined) {
        // Not in a tab: the browser's sidebar showing a site as its own page.
        sendResponse({ panel: true });
        return false;
      }
      ext.windows.get(wid).then(
        (w) => sendResponse({ tabId: sender.tab?.id, windowId: wid, popup: w.type === 'popup' }),
        () => sendResponse({ tabId: sender.tab?.id, windowId: wid }),
      );
      return true;
    }
    case 'save-workspace':
      saveWorkspace(msg.name).then(sendResponse, () => sendResponse(null));
      return true;
    case 'restore-workspace':
      restoreWorkspace(msg.id).then(() => sendResponse(true), () => sendResponse(false));
      return true;
    case 'sleep-tabs':
      sleepTabs().then(sendResponse, () => sendResponse(0));
      return true;
    case 'refresh-status':
      refreshStatus().then(sendResponse, () => sendResponse([]));
      return true;
    case 'edition-build':
      buildEdition().then(sendResponse, () => sendResponse(null));
      return true;
    case 'profile-import':
      importFromAi(msg.text, host).then(sendResponse, () => sendResponse({ ok: false, count: 0 }));
      return true;
  }
  return false;
});

ext.commands?.onCommand.addListener((command: string, tab?: chrome.tabs.Tab) => {
  if (!tab) return;
  if (command === 'ask-ai') return askFromBackground(tab);
  const view = command === 'open-search' ? 'search' : 'home';
  if (isRestricted(tab.url)) {
    // No rail on this page: use the browser sidebar (must stay synchronous).
    if (!openPanel(tab.windowId, { view })) void ext.runtime.openOptionsPage();
    return;
  }
  const msg: ToContent = command === 'toggle-rail' ? { type: 'toggle-rail' } : { type: 'open-view', view: 'search' };
  if (tab.id !== undefined) ext.tabs.sendMessage(tab.id, msg).catch(() => undefined);
});

((ext as any).contextMenus ?? (ext as any).menus)?.onClicked.addListener((info: any, tab?: chrome.tabs.Tab) => {
  if (!tab) return;
  if (info.menuItemId === 'ask-selection') return askFromBackground(tab, info.selectionText);
  if (info.menuItemId === 'ask-page') return askFromBackground(tab);
  if (info.menuItemId === 'ask-assistant') {
    // The sidebar first (needs this click, so before any await); else the page's drawer.
    if (!openPanel(tab.windowId, { view: 'chat' }) && tab.id !== undefined) void ext.tabs.sendMessage(tab.id, { type: 'open-view', view: 'chat' } satisfies ToContent).catch(() => undefined);
    void setLocal('chatPrefill', { text: String(info.selectionText ?? ''), ts: Date.now() });
    return;
  }
  if (info.menuItemId === 'add-stack') void addToStacks(info.linkUrl ?? info.pageUrl ?? tab.url ?? '', info.linkUrl ? info.selectionText ?? '' : tab.title ?? '');
  if (info.menuItemId === 'save-edition') void saveLink(info.linkUrl ?? info.pageUrl ?? tab.url ?? '', info.linkUrl ? info.linkText ?? info.selectionText ?? '' : tab.title ?? '');
  if (info.menuItemId === 'link-window' && info.linkUrl) void openMiniWindow({ url: info.linkUrl, openIn: 'window', side: now().rail.side }, tab.windowId);
});

ext.alarms.onAlarm.addListener((a) => {
  if (a.name === 'status') void refreshStatus();
  if (a.name === 'sleep') void sleepTabs(now().sleep.afterMin);
  if (a.name === 'edition') void buildEdition();
  if (a.name === 'walls') void refreshWalls();
  if (a.name === 'favicons') void checkFavicons(now().apps);
});

// Toolbar button where the browser has no side panel behavior.
ext.action?.onClicked?.addListener((tab) => {
  const sa = (ext as any).sidebarAction;
  if (TARGET === 'firefox' && sa?.toggle) return void sa.toggle();
  if (!features.sidePanel && tab.id !== undefined && !isRestricted(tab.url)) {
    ext.tabs.sendMessage(tab.id, { type: 'toggle-rail' } satisfies ToContent).catch(() => void ext.runtime.openOptionsPage());
  }
});

void sync();
