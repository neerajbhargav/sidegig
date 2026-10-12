// Entry for sidegig's own pages: the in-page drawer, the browser sidebar panel
// and the new tab page. Picks the context, applies the theme, routes views.
import { ext } from '../shared/api.ts';
import { loadSettings, onSettingsChanged, getLocal, onLocalChanged } from '../shared/storage.ts';
import { themeCss } from '../shared/theme.ts';
import type { Ctx, Kind, ViewName } from './ctx.ts';
import { send } from './ctx.ts';
import { h } from './dom.ts';
import { homeView } from './views/home.ts';
import { searchView } from './views/search.ts';
import { statusView } from './views/status.ts';
import { quickView } from './views/quick.ts';
import { appBar, framesHost, showFrames } from './views/appview.ts';
import { newtabView } from './views/newtab.ts';
import { addView } from './views/add.ts';

const params = new URLSearchParams((globalThis as any).__SIDEGIG_PARAMS__ ?? (location.hash.slice(1) || location.search.slice(1)));
const kind = (document.body.dataset.ctx ?? params.get('ctx') ?? 'panel') as Kind;
const nonce = params.get('n') ?? '';

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
  document.body.classList.add(`ctx-${kind}`);
  const [settings, where] = await Promise.all([loadSettings(), whereAmI()]);
  const themeStyle = h('style');
  document.head.append(themeStyle);
  let pageMode: 'light' | 'dark' | null = (params.get('mode') as 'light' | 'dark' | null) ?? null;
  if (pageMode !== 'light' && pageMode !== 'dark') pageMode = null;

  const view = h('div', { class: 'view' });
  const shell = h('div', { class: 'app' }, view, framesHost);
  document.body.append(shell);

  let current: { name: ViewName; app?: string } = { name: 'home' };
  let token = 0;

  const ctx: Ctx = {
    kind,
    settings,
    windowId: where.windowId,
    tabId: where.tabId,
    go: (name, opts) => void render(name, opts),
    close: () => window.parent.postMessage({ ns: 'sidegig', n: nonce, type: 'close' }, '*'),
    toRail: (msg) => window.parent.postMessage({ ns: 'sidegig', n: nonce, ...msg }, '*'),
  };

  const applyTheme = () => {
    const t = ctx.settings.theme;
    const mode = t.mode === 'page' ? pageMode ?? 'system' : t.mode;
    themeStyle.textContent = themeCss(':root', mode, t, t.radius) + (t.customCss || '');
  };

  async function render(name: ViewName, opts: { app?: string; q?: string } = {}) {
    const my = ++token;
    current = { name, app: opts.app ?? (name === 'app' ? current.app : undefined) };
    let el: HTMLElement;
    if (kind === 'newtab') el = await newtabView(ctx);
    else if (name === 'search') el = await searchView(ctx, opts.q ?? '');
    else if (name === 'status') el = await statusView(ctx);
    else if (name === 'settings') el = await quickView(ctx);
    else if (name === 'add') el = await addView(ctx);
    else if (name === 'app') el = await appBar(ctx, current.app);
    else el = await homeView(ctx);
    if (my !== token) return;
    view.replaceChildren(el);
    view.style.flex = name === 'app' ? 'none' : '1 1 auto';
    showFrames(name === 'app');
    if (kind === 'drawer') window.parent.postMessage({ ns: 'sidegig', n: nonce, type: 'view', view: name }, '*');
  }

  applyTheme();
  onSettingsChanged((s) => {
    ctx.settings = s;
    applyTheme();
    // Re-render data-driven views; leave search alone so typing isn't interrupted.
    if (current.name !== 'search') void render(current.name, { app: current.app });
  });
  onLocalChanged('badges', () => current.name === 'app' && void render('app', { app: current.app }));

  // Drawer: messages from the rail in the hosting page (checked by nonce).
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window.parent || !d || d.ns !== 'sidegig' || d.n !== nonce) return;
    if (d.type === 'view') void render(d.view, { app: d.app });
    if (d.type === 'theme') {
      pageMode = d.mode === 'light' || d.mode === 'dark' ? d.mode : null;
      applyTheme();
    }
  });

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
  if (kind === 'drawer') window.parent.postMessage({ ns: 'sidegig', n: nonce, type: 'ready' }, '*');
}

void boot();
