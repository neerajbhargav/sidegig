// The rail. Two ways to live on the page:
//   docked (default): always visible on your chosen side, and the page makes
//     room for it like Opera's sidebar, so nothing is covered (see dock.ts);
//   hover: slides in over the page when the pointer touches the edge.
// Drawn in a closed shadow root so page styles can't reach it.
import css from './rail.css';
import { ext, faviconFor, TARGET } from '../shared/api.ts';
import { loadSettings, onSettingsChanged, getLocal, onLocalChanged, updateSettings } from '../shared/storage.ts';
import { themeCss, modeForBackground } from '../shared/theme.ts';
import { iconNode } from '../shared/icons.ts';
import { hostExcluded } from '../shared/rules.ts';
import { badgeLabel } from '../shared/badge.ts';
import { buildPrompt } from '../shared/prompt.ts';
import { appFromCatalog } from '../shared/defaults.ts';
import { catalogById, CATALOG } from '../shared/catalog.ts';
import { hueOf } from '../ui/dom.ts';
import { Dock } from './dock.ts';
import type { AppEntry, Settings, StatusCard } from '../shared/types.ts';
import type { ToBackground, ToContent, View } from '../shared/messages.ts';

type DrawerView = View | 'app' | 'add';

const send = (msg: ToBackground) => ext.runtime.sendMessage(msg).catch(() => undefined);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const keys = (k: string) => (isMac ? `\u2325\u21e7${k}` : `Alt+Shift+${k}`);
const railWidth = (s: Settings) => (s.rail.size === 'compact' ? 44 : 52);

/** Should the rail dock (make room) on this site, per settings? */
function dockedHere(s: Settings): boolean {
  return s.rail.mode === 'docked' && !hostExcluded(s.rail.excluded, location.hostname) && !hostExcluded(s.rail.floatOn, location.hostname);
}

export function extractPage() {
  const selection = (window.getSelection()?.toString() ?? '').trim();
  const main = document.querySelector<HTMLElement>('main, article, [role="main"]');
  const src = main && main.innerText.length > 400 ? main : document.body;
  return { selection, text: (src?.innerText ?? '').slice(0, 80_000), title: document.title, url: location.href };
}

class Rail {
  private host = document.createElement('sidegig-rail');
  // Closed so pages can't poke at it (open only in the screenshot preview build).
  private root = this.host.attachShadow({ mode: TARGET === 'preview' ? 'open' : 'closed' });
  private style = document.createElement('style');
  private shell = document.createElement('div');
  private rail = document.createElement('nav');
  private drawer = document.createElement('div');
  private tip = document.createElement('div');
  private flyout = document.createElement('div');
  private flyTimer = 0;
  private ready = false;
  private pending: Record<string, unknown> | null = null;
  private hint = document.createElement('div');
  private iframe: HTMLIFrameElement | null = null;
  private nonce = Math.random().toString(36).slice(2);
  private built = false;
  private open = false;
  private sticky = false;
  private view: DrawerView | null = null;
  private dwell = 0;
  private hideTimer = 0;
  private tipTimer = 0;
  private badges: Record<string, number> = {};
  private statusNews = false;
  private mode: 'light' | 'dark' | 'system' = 'system';

  private tempHidden = false;
  /** The browser sidebar panel is open on this rail's side, so the panel's buttons list stands in for the rail. */
  private covered = false;
  private windowId: number | null = null;

  constructor(
    private s: Settings,
    private dock: Dock,
  ) {
    this.host.setAttribute('data-sidegig', '');
    this.shell.className = 'shell';
    this.rail.className = 'rail';
    this.rail.setAttribute('aria-label', 'sidegig');
    this.drawer.className = 'drawer';
    this.tip.className = 'tip';
    this.flyout.className = 'flyout';
    this.flyout.setAttribute('role', 'menu');
    this.flyout.addEventListener('pointerenter', () => clearTimeout(this.flyTimer));
    this.flyout.addEventListener('pointerleave', () => this.hideFlyout(250));
    this.hint.className = 'hint';
    this.shell.append(this.rail, this.drawer);
    this.root.append(this.style, this.hint, this.shell, this.tip, this.flyout);
    this.applySettings(s);
    this.mount();
    this.listen();
  }

  // ------------------------------------------------------------ lifecycle

  private mount() {
    document.documentElement.append(this.host);
    // Some apps rebuild <html> children; put the rail back if it gets removed.
    new MutationObserver(() => {
      if (!this.host.isConnected) document.documentElement.append(this.host);
    }).observe(document.documentElement, { childList: true });
  }

  private disabled = false;

  get enabledHere(): boolean {
    return !this.disabled && this.s.rail.mode !== 'off' && !hostExcluded(this.s.rail.excluded, location.hostname);
  }

  /** Docked right now: always visible and the page makes room. */
  get docked(): boolean {
    return !this.disabled && !this.tempHidden && !this.covered && dockedHere(this.s) && !document.fullscreenElement;
  }

  disableHere() {
    this.disabled = true;
    this.dock.set(0, this.s.rail.side);
    this.hide();
    this.host.style.display = 'none';
  }

  /** Remember which window this page is in, then follow the sidebar panel's open state. */
  setWindow(id: number) {
    this.windowId = id;
    void this.checkPanel();
    setInterval(() => void this.checkPanel(), 20_000);
  }

  private async checkPanel() {
    if (this.windowId === null) return;
    const map = await getLocal<Record<string, { side: string; ts: number }>>('panelOpen', {});
    const e = map[String(this.windowId)];
    const open = !!e && Date.now() - e.ts < 40_000 && e.side === this.s.rail.side;
    if (open === this.covered) return;
    this.covered = open;
    this.applySettings(this.s);
  }

  private drawerWidth(): number {
    return parseInt(this.drawer.style.width, 10) || this.s.drawer.width;
  }

  /** Tell the page how much room to make: the rail, plus the drawer when it's open. */
  private updateDock() {
    const w = this.docked ? railWidth(this.s) + (this.view ? this.drawerWidth() : 0) : 0;
    this.dock.set(w, this.s.rail.side);
  }

  applySettings(s: Settings) {
    this.s = s;
    this.host.dataset.side = s.rail.side;
    this.host.dataset.size = s.rail.size;
    this.host.dataset.mode = this.docked ? 'docked' : 'hover';
    this.host.style.display = (this.enabledHere && !this.tempHidden && !this.covered) || this.sticky ? '' : 'none';
    if (this.covered) {
      this.closeDrawer();
      this.open = false;
      delete this.host.dataset.open;
    }
    this.applyTheme();
    if (this.built) this.renderRail();
    if (this.drawer.classList.contains('show')) this.drawer.style.width = `${s.drawer.width}px`;
    if (this.docked) this.show(false);
    else if (this.open && !this.sticky && !this.view) this.hide();
    this.updateDock();
  }

  private applyTheme() {
    const t = this.s.theme;
    let mode: 'light' | 'dark' | 'system' = t.mode === 'page' ? 'system' : t.mode;
    if (t.mode === 'page') {
      mode =
        modeForBackground(getComputedStyle(document.body ?? document.documentElement).backgroundColor) ??
        modeForBackground(getComputedStyle(document.documentElement).backgroundColor) ??
        'system';
    }
    this.mode = mode;
    this.style.textContent = css + themeCss(':host', mode, t, t.radius) + (t.customCss || '');
    this.post({ type: 'theme', mode });
  }

  // ------------------------------------------------------------ building

  private build() {
    if (this.built) return;
    this.built = true;
    this.renderRail();
    void getLocal<Record<string, number>>('badges', {}).then((b) => this.setBadges(b));
    void this.refreshNews();
  }

  private button(label: string, inner: Node | Node[], onClick: (e: MouseEvent) => void, extra = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `item ${extra}`.trim();
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(...(Array.isArray(inner) ? inner : [inner]));
    // Keep the page's text selection and focus when clicking the rail.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      this.hideTip();
      onClick(e);
    });
    b.addEventListener('pointerenter', () => this.showTip(b, label));
    b.addEventListener('pointerleave', () => this.hideTip());
    return b;
  }

  private appIcon(app: AppEntry): Node[] {
    const src = faviconFor(app.url, 32);
    const letter = (app.name.trim()[0] ?? '?').toUpperCase();
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.hidden = true;
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      img.dataset.letter = letter;
      return [img, badge];
    }
    const mono = document.createElement('span');
    mono.className = 'mono';
    mono.textContent = letter;
    mono.style.setProperty('--h', String(hueOf(app.url)));
    return [mono, badge];
  }

  /** Swap a broken site icon for a tinted letter tile. */
  private wireFallback(b: HTMLElement, app: AppEntry) {
    const img = b.querySelector('img');
    img?.addEventListener('error', () => {
      const m = Object.assign(document.createElement('span'), { className: 'mono', textContent: img.dataset.letter ?? '?' });
      m.style.setProperty('--h', String(hueOf(app.url)));
      img.replaceWith(m);
    });
  }

  private renderRail() {
    const s = this.s;
    this.rail.textContent = '';
    this.rail.append(this.tool('home', 'Home', iconNode('logo', 22), 'logo'));
    this.rail.append(Object.assign(document.createElement('div'), { className: 'sep' }));

    const apps = document.createElement('div');
    apps.className = 'scroll';
    for (const app of s.apps) {
      const b = this.button(app.name, this.appIcon(app), () => this.openApp(app));
      b.dataset.app = app.id;
      this.wireFallback(b, app);
      apps.append(b);
    }
    apps.append(this.tool('add', 'Add this site', iconNode('plus', 20), 'add'));
    this.rail.append(apps);
    this.rail.append(Object.assign(document.createElement('div'), { className: 'sep' }));
    this.rail.append(this.tool('search', `Search  ${keys('K')}`, iconNode('search')));
    this.rail.append(this.tool('status', 'Status', iconNode('pulse'), this.statusNews ? 'glow status' : 'status'));
    const ai = this.button(`Ask ${this.aiApp()?.name ?? 'AI'}  ${keys('A')}`, iconNode('sparkle'), () => this.askAi(), 'ai');
    ai.addEventListener('pointerenter', () => this.showFlyout(ai, 450));
    ai.addEventListener('pointerleave', () => this.hideFlyout(300));
    ai.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showFlyout(ai, 0);
    });
    this.rail.append(ai);
    this.rail.append(Object.assign(document.createElement('div'), { className: 'spacer' }));
    const docked = s.rail.mode === 'docked';
    const dockIcon = iconNode(s.rail.side === 'left' ? 'sidebar' : 'sidebarRight');
    const pin = this.button(docked ? 'Undock (show on hover)' : 'Dock to the side', dockIcon, () => this.togglePin());
    pin.setAttribute('aria-pressed', String(docked));
    this.rail.append(pin);
    this.rail.append(this.tool('settings', 'Settings', iconNode('sliders')));
    this.setBadges(this.badges);
    this.markActive();
  }

  /** A rail button that opens a drawer view and shows as pressed while it's open. */
  private tool(view: DrawerView, label: string, inner: Node, extra = ''): HTMLButtonElement {
    const b = this.button(label, inner, () => this.toggleDrawer(view), extra);
    b.dataset.view = view;
    return b;
  }

  private markActive() {
    for (const b of this.rail.querySelectorAll<HTMLElement>('button[data-view]')) {
      b.setAttribute('aria-pressed', String(!!this.view && b.dataset.view === this.view));
    }
  }

  // ------------------------------------------------------------ AI picker

  private aiChoices(): AppEntry[] {
    const mine = this.s.apps.filter((a) => catalogById(a.catalogId ?? '')?.category === 'AI');
    const rest = CATALOG.filter((c) => c.category === 'AI' && !mine.some((a) => a.catalogId === c.id)).map((c) => appFromCatalog(c.id));
    return [...mine, ...rest];
  }

  private showFlyout(anchor: HTMLElement, delay: number) {
    clearTimeout(this.flyTimer);
    this.flyTimer = window.setTimeout(() => {
      this.hideTip();
      this.flyout.textContent = '';
      const label = Object.assign(document.createElement('div'), { className: 'fly-label', textContent: 'Ask about this page' });
      this.flyout.append(label);
      const row = document.createElement('div');
      row.className = 'fly-row';
      for (const app of this.aiChoices()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'item';
        b.title = app.name;
        b.setAttribute('aria-label', `Ask ${app.name}`);
        b.append(...this.appIcon(app));
        this.wireFallback(b, app);
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          this.hideFlyout(0);
          this.askAi(undefined, app);
        });
        row.append(b);
      }
      this.flyout.append(row);
      const r = anchor.getBoundingClientRect();
      const shell = this.rail.getBoundingClientRect();
      this.flyout.style.top = `${r.top + r.height / 2}px`;
      if (this.s.rail.side === 'left') {
        this.flyout.style.left = `${shell.right + 8}px`;
        this.flyout.style.right = '';
      } else {
        this.flyout.style.right = `${window.innerWidth - shell.left + 8}px`;
        this.flyout.style.left = '';
      }
      this.flyout.classList.add('show');
    }, delay);
  }

  private hideFlyout(delay: number) {
    clearTimeout(this.flyTimer);
    this.flyTimer = window.setTimeout(() => this.flyout.classList.remove('show'), delay);
  }

  private setBadges(b: Record<string, number>) {
    this.badges = b ?? {};
    if (!this.built) return;
    for (const el of this.rail.querySelectorAll<HTMLElement>('[data-app]')) {
      const badge = el.querySelector<HTMLElement>('.badge');
      const app = this.s.apps.find((a) => a.id === el.dataset.app);
      const n = app?.badge ? this.badges[el.dataset.app!] ?? 0 : 0;
      if (!badge) continue;
      badge.hidden = n === 0;
      badge.classList.toggle('dot', n < 0);
      badge.textContent = badgeLabel(n);
    }
  }

  private async refreshNews() {
    const [cards, seen] = await Promise.all([getLocal<StatusCard[]>('status', []), getLocal<Record<string, string>>('statusSeen', {})]);
    this.statusNews = cards.some((c) => this.s.status[c.id] && c.signature && seen[c.id] !== c.signature);
    this.rail.querySelector('.status')?.classList.toggle('glow', this.statusNews);
  }

  // ------------------------------------------------------------ show / hide

  show(sticky: boolean) {
    this.build();
    this.sticky = this.sticky || sticky;
    clearTimeout(this.hideTimer);
    if (this.open) return;
    this.open = true;
    this.host.style.display = '';
    if (this.s.rail.side === 'right') {
      const sbw = window.innerWidth - document.documentElement.clientWidth;
      this.host.style.setProperty('--sbw', `${Math.max(0, sbw)}px`);
    }
    if (this.s.theme.mode === 'page') this.applyTheme();
    this.host.dataset.open = '';
    this.preload();
  }

  hide() {
    if (this.docked) {
      this.closeDrawer();
      return;
    }
    this.open = false;
    this.sticky = false;
    this.closeDrawer();
    this.hideTip();
    delete this.host.dataset.open;
    if (!this.enabledHere) setTimeout(() => !this.open && (this.host.style.display = 'none'), 250);
  }

  private scheduleHide(ms = 350) {
    clearTimeout(this.hideTimer);
    // A drawer you opened on purpose stays until Esc, a click on the page, or close.
    if (this.sticky || this.docked || this.view || this.drawerFocused()) return;
    this.hideTimer = window.setTimeout(() => this.hide(), ms);
  }

  private drawerFocused(): boolean {
    return !!this.view && document.activeElement === this.host;
  }

  // ------------------------------------------------------------ drawer

  private ensureIframe(view: DrawerView, appId?: string) {
    if (this.iframe) return;
    const f = document.createElement('iframe');
    const params = new URLSearchParams({ ctx: 'drawer', view, side: this.s.rail.side, n: this.nonce, mode: this.mode });
    if (appId) params.set('app', appId);
    const preview = (globalThis as any).__SIDEGIG_PREVIEW__;
    if (TARGET === 'preview' && preview) f.srcdoc = preview.drawerHtml(String(params));
    else f.src = `${ext.runtime.getURL('drawer.html')}#${params}`;
    f.allow = 'clipboard-read; clipboard-write; microphone';
    f.title = 'sidegig';
    const resize = document.createElement('div');
    resize.className = 'resize';
    const cover = document.createElement('div');
    cover.className = 'cover';
    this.drawer.append(f, cover, resize);
    this.iframe = f;
    this.wireResize(resize);
  }

  private post(msg: Record<string, unknown>) {
    if (!this.iframe) return;
    if (!this.ready && msg.type === 'view') {
      this.pending = msg;
      return;
    }
    this.iframe.contentWindow?.postMessage({ ns: 'sidegig', n: this.nonce, ...msg }, '*');
  }

  /** Load the drawer quietly after the rail first appears, so opening it is instant. */
  private preload() {
    if (this.iframe) return;
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
    idle(() => this.ensureIframe('home'));
  }

  openDrawer(view: DrawerView, appId?: string) {
    this.show(false);
    const fresh = !this.iframe;
    this.ensureIframe(view, appId);
    if (!fresh) this.post({ type: 'view', view, app: appId });
    this.view = view;
    this.drawer.style.width = `${this.s.drawer.width}px`;
    this.drawer.classList.add('show');
    this.markActive();
    this.updateDock();
    if (view === 'status') {
      this.statusNews = false;
      this.rail.querySelector('.status')?.classList.remove('glow');
    }
  }

  closeDrawer() {
    const had = !!this.view;
    this.view = null;
    this.drawer.classList.remove('show');
    this.markActive();
    if (had) this.updateDock();
  }

  toggleDrawer(view: DrawerView) {
    if (this.view === view) this.closeDrawer();
    else this.openDrawer(view);
  }

  private wireResize(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('drag');
      this.drawer.classList.add('resizing');
      const rect = this.drawer.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const w = this.s.rail.side === 'left' ? ev.clientX - rect.left : rect.right - ev.clientX;
        this.drawer.style.width = `${Math.round(Math.min(720, Math.max(280, w)))}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.classList.remove('drag');
        this.drawer.classList.remove('resizing');
        const width = parseInt(this.drawer.style.width, 10);
        this.updateDock();
        void updateSettings((s) => void (s.drawer.width = width));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
  }

  // ------------------------------------------------------------ actions

  private aiApp(): AppEntry | undefined {
    const id = this.s.ai.defaultApp;
    return this.s.apps.find((a) => a.id === id) ?? (catalogById(id) ? appFromCatalog(id) : undefined);
  }

  openApp(app: AppEntry) {
    if (app.openIn === 'drawer') return this.toggleDrawer('app'), this.post({ type: 'view', view: 'app', app: app.id });
    send({ type: 'open-app', appId: app.id, url: app.url, openIn: app.openIn, side: this.s.rail.side });
  }

  askAi(selection?: string, chosen?: AppEntry) {
    const app = chosen ?? this.aiApp();
    if (!app) return this.openDrawer('settings');
    const page = extractPage();
    const sel = selection ?? page.selection;
    const prompt = buildPrompt({
      template: sel ? this.s.ai.selectionTemplate : this.s.ai.pageTemplate,
      text: sel || page.text,
      title: page.title,
      url: page.url,
      maxChars: this.s.ai.maxChars,
    });
    send({ type: 'ask-ai', appId: app.id, url: app.url, openIn: app.openIn, side: this.s.rail.side, prompt, autoSend: this.s.ai.autoSend });
  }

  private togglePin() {
    void updateSettings((s) => void (s.rail.mode = s.rail.mode === 'docked' ? 'hover' : 'docked'));
  }

  // ------------------------------------------------------------ tooltips

  private showTip(el: HTMLElement, text: string) {
    clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const shell = this.rail.getBoundingClientRect();
      this.tip.textContent = text.trim();
      this.tip.style.top = `${r.top + r.height / 2}px`;
      if (this.s.rail.side === 'left') {
        this.tip.style.left = `${shell.right + 10}px`;
        this.tip.style.right = '';
      } else {
        this.tip.style.right = `${window.innerWidth - shell.left + 10}px`;
        this.tip.style.left = '';
      }
      this.tip.classList.add('show');
    }, 220);
  }

  private hideTip() {
    clearTimeout(this.tipTimer);
    this.tip.classList.remove('show');
  }

  // ------------------------------------------------------------ events

  private atEdge(x: number, zone: number): boolean {
    if (this.s.rail.side === 'left') return x <= zone;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    return x >= window.innerWidth - sbw - zone;
  }

  private listen() {
    let raf = 0;
    document.addEventListener(
      'mousemove',
      (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!this.enabledHere || this.open || this.docked) return;
          const near = this.atEdge(e.clientX, 28);
          if (near) this.host.dataset.near = '';
          else delete this.host.dataset.near;
          if (this.atEdge(e.clientX, this.s.rail.hotZone)) {
            this.build();
            if (!this.dwell) this.dwell = window.setTimeout(() => ((this.dwell = 0), this.show(false)), this.s.rail.delay);
          } else if (this.dwell) {
            clearTimeout(this.dwell);
            this.dwell = 0;
          }
        });
      },
      { passive: true },
    );
    this.shell.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
    this.shell.addEventListener('pointerleave', () => this.scheduleHide());
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!this.open || e.composedPath().includes(this.host)) return;
        // Docked: the drawer sits beside the page like a pinned Opera panel, so clicks on the page leave it open.
        if (this.docked) return;
        this.hide();
      },
      true,
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.open) return;
        if (this.view) this.closeDrawer();
        else this.hide();
      },
      true,
    );
    document.addEventListener('fullscreenchange', () => {
      const full = !!document.fullscreenElement;
      this.dock.suspend(full);
      if (this.s.rail.hideInFullscreen) this.host.style.visibility = full ? 'hidden' : '';
      if (!full) this.updateDock();
    });
    window.addEventListener('message', (e) => {
      if (!this.iframe || e.source !== this.iframe.contentWindow) return;
      const d = e.data;
      if (!d || d.ns !== 'sidegig' || d.n !== this.nonce) return;
      if (d.type === 'close') this.hide();
      if (d.type === 'view' && this.view) {
        this.view = d.view;
        this.markActive();
      }
      if (d.type === 'ask-ai') this.askAi();
      if (d.type === 'ready') {
        this.ready = true;
        this.post({ type: 'theme', mode: this.mode });
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          this.post(p);
        }
      }
    });
    ext.runtime.onMessage.addListener((msg: ToContent | { type: 'extract' }, _sender, reply) => {
      if (msg.type === 'extract') {
        const p = extractPage();
        reply({ text: p.selection || p.text, title: p.title, url: p.url });
        return false;
      }
      if (msg.type === 'toggle-rail') {
        if (dockedHere(this.s)) {
          // Docked: hide it on this page (and give the space back), or bring it back.
          this.tempHidden = !this.tempHidden;
          if (this.tempHidden) {
            this.closeDrawer();
            this.open = false;
            delete this.host.dataset.open;
            this.host.style.display = 'none';
          } else this.applySettings(this.s);
          this.updateDock();
        } else if (this.open) this.hide();
        else this.show(true);
      }
      if (msg.type === 'open-view') {
        this.show(true);
        this.openDrawer(msg.view);
      }
      if (msg.type === 'ask-ai') this.askAi(msg.selection);
      return false;
    });
    onSettingsChanged((s) => this.applySettings(s));
    onLocalChanged('badges', (b) => this.setBadges((b as Record<string, number>) ?? {}));
    onLocalChanged('status', () => void this.refreshNews());
    onLocalChanged('statusSeen', () => void this.refreshNews());
    onLocalChanged('panelOpen', () => void this.checkPanel());
    if (this.s.theme.mode === 'page') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    }
  }
}

async function main() {
  if ((window as any).__sidegigRail) return;
  (window as any).__sidegigRail = true;
  const settings = await loadSettings();
  // Make room as early as possible (this script runs at document_start), so the
  // page lays out at its narrower width from the start instead of jumping.
  const dock = new Dock();
  if (dockedHere(settings)) dock.set(railWidth(settings), settings.rail.side);
  const start = async () => {
    const rail = new Rail(settings, dock);
    // Mini windows sidegig opens for apps stay clean: no rail inside them.
    const info = (await send({ type: 'tab-info' })) as { popup?: boolean; windowId?: number } | undefined;
    if (info?.popup) rail.disableHere();
    else if (typeof info?.windowId === 'number') rail.setWindow(info.windowId);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
  else void start();
}

if (window.top === window && document.documentElement && !(document.contentType && !/html/.test(document.contentType))) {
  void main();
}
