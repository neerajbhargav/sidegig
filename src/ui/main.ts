// Entry for sidegig's own pages: the in-page drawer, the browser sidebar panel
// and the new tab page. Picks the context, applies the theme, routes views.
import { ext } from '../shared/api.ts';
import { loadSettings, onSettingsChanged, getLocal, onLocalChanged } from '../shared/storage.ts';
import { themeCss } from '../shared/theme.ts';
import type { Ctx, Kind, ViewName } from './ctx.ts';
import { send } from './ctx.ts';
import { panelRail } from './views/prail.ts';
import { updateSettings, setLocal } from '../shared/storage.ts';
import { iconButton, setFavMissing, setIconStyle } from './dom.ts';
import { applyScale } from '../shared/scale.ts';
import { h } from './dom.ts';
import { homeView } from './views/home.ts';
import { searchView } from './views/search.ts';
import { statusView } from './views/status.ts';
import { quickView } from './views/quick.ts';
import { appBar, framesHost, showFrames } from './views/appview.ts';
import { newtabView } from './views/newtab.ts';
import { addView } from './views/add.ts';
import { chatUi } from './views/ntchat.ts';

const params = new URLSearchParams((globalThis as any).__SIDEGIG_PARAMS__ ?? (location.hash.slice(1) || location.search.slice(1)));
const kind = (document.body.dataset.ctx ?? params.get('ctx') ?? 'panel') as Kind;
const nonce = params.get('n') ?? '';

// Drawer <-> rail: a private MessageChannel. The rail hands over its port once,
// tagged with the nonce from our URL (the page can't read it). Nothing is posted
// to the hosting page itself, so the page never sees the nonce or the traffic.
let railPort: MessagePort | null = null;
const toRailQueue: Record<string, unknown>[] = [];
let fromRail: (d: Record<string, unknown>) => void = () => undefined;
const toRail = (msg: Record<string, unknown>) => (railPort ? railPort.postMessage(msg) : toRailQueue.push(msg));
if (kind === 'drawer') {
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (railPort || e.source !== window.parent || d?.ns !== 'sidegig' || d.n !== nonce || d.type !== 'port' || !e.ports[0]) return;
    railPort = e.ports[0];
    railPort.onmessage = (m) => m.data && fromRail(m.data);
    for (const m of toRailQueue.splice(0)) railPort.postMessage(m);
  });
}

async function whereAmI(): Promise<{ tabId?: number; windowId?: number }> {
  if (kind === 'drawer') {
    const tab = await ext.tabs.getCurrent().catch(() => undefined);
    if (tab) return { tabId: tab.id, windowId: tab.windowId };
    const info = (await send({ type: 'tab-info' }).catch(() => null)) as { tabId?: number; windowId?: number } | null;
    return info ?? {};
  }
  const w = await ext.windows.getCurrent().catch(() => undefined);
  return { windowId: w?.id };
}

async function boot() {
  if (document.documentElement.dataset.off) return; // handing this tab back to the browser's own new tab
  document.body.classList.add(`ctx-${kind}`);
  const [settings, where] = await Promise.all([loadSettings(), whereAmI()]);
  if (kind === 'newtab' && !settings.newtab.enabled) {
    // Turned off (maybe on another device): remember, and go to the browser's own new tab.
    const fallback = (await getLocal<{ ntp?: string } | null>('browserInfo', null))?.ntp ?? 'chrome://new-tab-page/';
    try {
      localStorage.setItem('sidegig.ntOff', '1');
      localStorage.setItem('sidegig.ntFallback', fallback);
    } catch {
      /* fine */
    }
    const tab = await ext.tabs.getCurrent().catch(() => undefined);
    if (tab?.id !== undefined) await ext.tabs.update(tab.id, { url: fallback });
    return;
  }
  if (kind === 'newtab') {
    try {
      localStorage.removeItem('sidegig.ntOff');
    } catch {
      /* fine */
    }
  }
  // Match the browser we're in (fonts, corner radius) so sidegig never looks alien.
  void getLocal<{ id?: string } | null>('browserInfo', null).then((b) => b?.id && (document.body.dataset.browser = b.id));
  setFavMissing(await getLocal<string[]>('favMissing', []));
  const themeStyle = h('style');
  document.head.append(themeStyle);
  let pageMode: 'light' | 'dark' | null = (params.get('mode') as 'light' | 'dark' | null) ?? null;
  if (pageMode !== 'light' && pageMode !== 'dark') pageMode = null;

  const view = h('div', { class: 'view' });
  const railHost = h('div', { class: 'prail-host' });
  const hintHost = h('div');
  // Which side the browser shows its sidebar on (Chrome 140+ can tell us).
  let side: 'left' | 'right' = settings.rail.side;
  let browserSide: 'left' | 'right' | null = null;
  if (kind === 'panel') {
    const layout = await (ext as any).sidePanel?.getLayout?.().catch(() => null);
    if (layout?.side === 'left' || layout?.side === 'right') browserSide = side = layout.side;
  }
  if (kind === 'panel') {
    // Opera layout: buttons list on the outer edge, the panel right beside it.
    const main = h('div', { class: 'pmain' }, hintHost, view, framesHost);
    document.body.append(h('div', { class: 'pshell', 'data-side': side }, railHost, main));
  } else {
    document.body.append(h('div', { class: 'app' }, view, framesHost));
  }

  let current: { name: ViewName; app?: string } = { name: 'home' };
  let token = 0;
  let renderLife: AbortController | undefined;
  addEventListener('pagehide', (e) => { if (!e.persisted) renderLife?.abort(); });

  const ctx: Ctx = {
    kind,
    settings,
    windowId: where.windowId,
    tabId: where.tabId,
    go: (name, opts) => void render(name, opts),
    close: () => toRail({ type: 'close' }),
    toRail,
  };
  setIconStyle(settings.theme.icons);

  const applyTheme = () => {
    const t = ctx.settings.theme;
    const mode = t.mode === 'page' ? pageMode ?? 'system' : t.mode;
    themeStyle.textContent = themeCss(':root', mode, t, t.radius) + (t.customCss || '');
    document.documentElement.dataset.icons = t.icons;
    applyScale(document.documentElement, t.scale);
    setIconStyle(t.icons);
    if (kind !== 'newtab') document.documentElement.dataset.ui = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  };

  async function render(name: ViewName, opts: { app?: string; q?: string } = {}) {
    const my = ++token;
    renderLife?.abort();
    const life = new AbortController();
    renderLife = life;
    const viewCtx: Ctx = { ...ctx, signal: life.signal };
    current = { name, app: opts.app ?? (name === 'app' ? current.app : undefined) };
    let el: HTMLElement;
    if (kind === 'newtab') el = await newtabView(viewCtx);
    else if (name === 'search') el = await searchView(viewCtx, opts.q ?? '');
    else if (name === 'status') el = await statusView(viewCtx);
    else if (name === 'settings') el = await quickView(viewCtx);
    else if (name === 'add') el = await addView(viewCtx);
    else if (name === 'chat') el = (await chatUi(viewCtx, { where: 'panel' })).view;
    else if (name === 'app') el = await appBar(viewCtx, current.app);
    else el = await homeView(viewCtx);
    if (my !== token) return;
    view.replaceChildren(el);
    hintHost.hidden = name !== 'home';
    view.style.flex = name === 'app' ? 'none' : '1 1 auto';
    showFrames(name === 'app');
    if (kind === 'panel') void renderRail();
    if (kind === 'drawer') toRail({ type: 'view', view: name, app: current.app });
  }

  async function renderRail() {
    railHost.replaceChildren(await panelRail(ctx, current));
  }

  /** Offer to line the rail up with the side the browser puts its sidebar on. */
  async function renderHint() {
    hintHost.textContent = '';
    if (kind !== 'panel' || !browserSide || browserSide === ctx.settings.rail.side) return;
    if (await getLocal('sideHintDismissed', false)) return;
    const other = browserSide === 'left' ? 'left' : 'right';
    hintHost.append(
      h(
        'div',
        { class: 'side-hint' },
        h('div', { class: 'side-hint-text' }, `The page rail is on the ${ctx.settings.rail.side}.`),
        h('button', { class: 'btn', type: 'button', title: `Move the page rail to the ${other}, beside this sidebar`, onclick: () => void updateSettings((s) => void (s.rail.side = other)) }, 'Align rail'),
        iconButton('close', 'Dismiss alignment hint', async () => {
          await setLocal('sideHintDismissed', true);
          hintHost.textContent = '';
        }),
      ),
    );
  }

  // Tell pages in this window the panel is open, so the page rail steps
  // aside and the panel's own buttons list takes its place (one sidebar, not two).
  if (kind === 'panel' && where.windowId !== undefined) {
    const windowId = where.windowId;
    // Normal panel.html tabs are diagnostics, not native side panels.
    void ext.tabs.getCurrent().catch(() => undefined).then((tab) => {
      if (tab?.id !== undefined) return;
      let closing = false;
      let port: chrome.runtime.Port | undefined;
      let reconnect: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        if (closing) return;
        const current = ext.runtime.connect({ name: 'sidegig-panel' });
        port = current;
        const beat = () => { try { current.postMessage({ windowId, side }); } catch { /* reconnect on disconnect */ } };
        beat();
        const heartbeat = setInterval(beat, 15_000);
        current.onDisconnect.addListener(() => {
          void ext.runtime.lastError;
          clearInterval(heartbeat);
          if (!closing) reconnect = setTimeout(connect, 250);
        });
      };
      addEventListener('pagehide', () => { closing = true; clearTimeout(reconnect); port?.disconnect(); }, { once: true });
      connect();
    });
  }

  applyTheme();
  void renderHint();
  // Moving widgets or recolouring a folder saves settings but is already drawn: don't rebuild the page for it.
  const drawnKey = (s: typeof ctx.settings) => JSON.stringify({ ...s, newtab: { ...s.newtab, layout: null, folderTones: null } });
  let drawn = drawnKey(ctx.settings);
  onSettingsChanged((s) => {
    const key = drawnKey(s);
    const same = kind === 'newtab' && key === drawn;
    drawn = key;
    ctx.settings = s;
    if (same) return;
    applyTheme();
    // Re-render data-driven views; leave search alone so typing isn't interrupted.
    if (current.name !== 'search') void render(current.name, { app: current.app });
    void renderHint();
  });
  onLocalChanged('favMissing', (v) => {
    setFavMissing((v as string[] | undefined) ?? []);
    if (current.name !== 'search') void render(current.name, { app: current.app });
  });
  onLocalChanged('badges', () => (kind === 'panel' ? void renderRail() : current.name === 'app' && void render('app', { app: current.app })));
  onLocalChanged('status', () => kind === 'panel' && void renderRail());

  // Drawer: messages from the rail in the hosting page, over the private port.
  fromRail = (d) => {
    if (d.type === 'view') void render(d.view as ViewName, { app: d.app as string | undefined });
    if (d.type === 'theme') {
      pageMode = d.mode === 'light' || d.mode === 'dark' ? d.mode : null;
      applyTheme();
    }
  };

  // Panel: requests from the rail or background ("show Claude").
  if (kind === 'panel') {
    const handle = (r: unknown) => {
      const req = r as { appId?: string; view?: ViewName; ts?: number } | null;
      if (!req || !req.ts || Date.now() - req.ts > 15_000) return false;
      if (req.appId) void render('app', { app: req.appId });
      else if (req.view) void render(req.view);
      return true;
    };
    onLocalChanged('panelRequest', handle);
    if (!handle(await getLocal('panelRequest', null))) await render('home');
  } else {
    await render((params.get('view') as ViewName) || 'home', { app: params.get('app') ?? undefined });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && kind !== 'newtab') {
      e.preventDefault();
      void render('search');
    }
    if (e.key === 'Escape' && kind === 'drawer' && current.name !== 'search') ctx.close();
  });
  if (kind === 'drawer') toRail({ type: 'ready' });
}

void boot();
