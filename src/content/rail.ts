// The rail: a slim strip that slides in when the pointer touches the edge of
// the page. Drawn in a closed shadow root so page styles can't reach it, and
// built lazily so pages pay almost nothing until the edge is touched.
import css from './rail.css';
import { ext, faviconFor, TARGET } from '../shared/api.ts';
import { loadSettings, onSettingsChanged, getLocal, onLocalChanged, updateSettings } from '../shared/storage.ts';
import { themeCss, modeForBackground } from '../shared/theme.ts';
import { icon } from '../shared/icons.ts';
import { hostExcluded } from '../shared/rules.ts';
import { badgeLabel } from '../shared/badge.ts';
import { buildPrompt } from '../shared/prompt.ts';
import { appFromCatalog } from '../shared/defaults.ts';
import { catalogById } from '../shared/catalog.ts';
import type { AppEntry, Settings, StatusCard } from '../shared/types.ts';
import type { ToBackground, ToContent, View } from '../shared/messages.ts';

type DrawerView = View | 'app';

const send = (msg: ToBackground) => ext.runtime.sendMessage(msg).catch(() => undefined);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const keys = (k: string) => (isMac ? `\u2325\u21e7${k}` : `Alt+Shift+${k}`);

export function extractPage() {
  const selection = (window.getSelection()?.toString() ?? '').trim();
  const main = document.querySelector<HTMLElement>('main, article, [role="main"]');
  const src = main && main.innerText.length > 400 ? main : document.body;
  return { selection, text: (src?.innerText ?? '').slice(0, 80_000), title: document.title, url: location.href };
}

class Rail {
  private host = document.createElement('margin-rail');
  // Closed so pages can't poke at it (open only in the screenshot preview build).
  private root = this.host.attachShadow({ mode: TARGET === 'preview' ? 'open' : 'closed' });
  private style = document.createElement('style');
  private shell = document.createElement('div');
  private rail = document.createElement('nav');
  private drawer = document.createElement('div');
  private tip = document.createElement('div');
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

  constructor(private s: Settings) {
    this.shell.className = 'shell';
    this.rail.className = 'rail';
    this.rail.setAttribute('aria-label', 'Margin');
    this.drawer.className = 'drawer';
    this.tip.className = 'tip';
    this.hint.className = 'hint';
    this.shell.append(this.rail, this.drawer);
    this.root.append(this.style, this.hint, this.shell, this.tip);
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

  disableHere() {
    this.disabled = true;
    this.hide();
    this.host.style.display = 'none';
  }

  applySettings(s: Settings) {
    this.s = s;
    this.host.dataset.side = s.rail.side;
    this.host.dataset.size = s.rail.size;
    this.host.style.display = this.enabledHere || this.sticky ? '' : 'none';
    this.applyTheme();
    if (this.built) this.renderRail();
    if (s.rail.mode === 'pinned' && this.enabledHere) this.show(false);
    else if (this.open && !this.sticky && !this.view) this.hide();
    if (this.drawer.classList.contains('show')) this.drawer.style.width = `${s.drawer.width}px`;
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

  private button(label: string, inner: string, onClick: (e: MouseEvent) => void, extra = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `item ${extra}`.trim();
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = inner;
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

  private appIcon(app: AppEntry): string {
    const src = faviconFor(app.url, 32);
    const letter = (app.name.trim()[0] ?? '?').toUpperCase();
    return src
      ? `<img alt="" src="${src}" data-letter="${letter}"><span class="badge" hidden></span>`
      : `<span class="mono">${letter}</span><span class="badge" hidden></span>`;
  }

  private renderRail() {
    const s = this.s;
    this.rail.textContent = '';
    this.rail.append(this.button('Home', icon('logo', 22), () => this.toggleDrawer('home'), 'logo'));
    this.rail.append(Object.assign(document.createElement('div'), { className: 'sep' }));

    const apps = document.createElement('div');
    apps.className = 'scroll';
    for (const app of s.apps) {
      const b = this.button(app.name, this.appIcon(app), () => this.openApp(app));
      b.dataset.app = app.id;
      const img = b.querySelector('img');
      img?.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('span'), { className: 'mono', textContent: img.dataset.letter ?? '?' }));
      });
      apps.append(b);
    }
    this.rail.append(apps);
    this.rail.append(Object.assign(document.createElement('div'), { className: 'sep' }));
    this.rail.append(this.button(`Search  ${keys('K')}`, icon('search'), () => this.toggleDrawer('search')));
    this.rail.append(this.button('Status', icon('pulse'), () => this.toggleDrawer('status'), this.statusNews ? 'glow status' : 'status'));
    this.rail.append(this.button(`Ask ${this.aiApp()?.name ?? 'AI'}  ${keys('A')}`, icon('sparkle'), () => this.askAi()));
    this.rail.append(Object.assign(document.createElement('div'), { className: 'spacer' }));
    const pinned = s.rail.mode === 'pinned';
    const pin = this.button(pinned ? 'Unpin (show on hover)' : 'Keep visible', icon(pinned ? 'pinOff' : 'pin'), () => this.togglePin());
    pin.setAttribute('aria-pressed', String(pinned));
    this.rail.append(pin);
    this.rail.append(this.button('Settings', icon('sliders'), () => this.toggleDrawer('settings')));
    this.setBadges(this.badges);
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
  }

  hide() {
    if (this.s.rail.mode === 'pinned' && this.enabledHere) {
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
    if (this.sticky || this.s.rail.mode === 'pinned' || this.drawerFocused()) return;
    this.hideTimer = window.setTimeout(() => this.hide(), this.view ? 700 : ms);
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
    const preview = (globalThis as any).__MARGIN_PREVIEW__;
    if (TARGET === 'preview' && preview) f.srcdoc = preview.drawerHtml(String(params));
    else f.src = `${ext.runtime.getURL('drawer.html')}#${params}`;
    f.allow = 'clipboard-read; clipboard-write; microphone';
    f.title = 'Margin';
    const resize = document.createElement('div');
    resize.className = 'resize';
    const cover = document.createElement('div');
    cover.className = 'cover';
    this.drawer.append(f, cover, resize);
    this.iframe = f;
    this.wireResize(resize);
  }

  private post(msg: Record<string, unknown>) {
    this.iframe?.contentWindow?.postMessage({ ns: 'margin', n: this.nonce, ...msg }, '*');
  }

  openDrawer(view: DrawerView, appId?: string) {
    this.show(false);
    const fresh = !this.iframe;
    this.ensureIframe(view, appId);
    if (!fresh) this.post({ type: 'view', view, app: appId });
    this.view = view;
    this.drawer.style.width = `${this.s.drawer.width}px`;
    this.drawer.classList.add('show');
    for (const b of this.rail.querySelectorAll<HTMLElement>('button.item')) b.removeAttribute('aria-pressed');
    if (this.s.rail.mode === 'pinned') this.rail.querySelector('button.item:nth-last-child(2)')?.setAttribute('aria-pressed', 'true');
    if (view === 'status') this.statusNews = false;
  }

  closeDrawer() {
    this.view = null;
    this.drawer.classList.remove('show');
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

  askAi(selection?: string) {
    const app = this.aiApp();
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
    void updateSettings((s) => void (s.rail.mode = s.rail.mode === 'pinned' ? 'hover' : 'pinned'));
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
          if (!this.enabledHere || this.open) return;
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
        if (this.s.rail.mode === 'pinned' && this.enabledHere) this.closeDrawer();
        else this.hide();
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
      if (!this.s.rail.hideInFullscreen) return;
      this.host.style.visibility = document.fullscreenElement ? 'hidden' : '';
    });
    window.addEventListener('message', (e) => {
      if (!this.iframe || e.source !== this.iframe.contentWindow) return;
      const d = e.data;
      if (!d || d.ns !== 'margin' || d.n !== this.nonce) return;
      if (d.type === 'close') this.hide();
      if (d.type === 'view') this.view = d.view;
      if (d.type === 'ask-ai') this.askAi();
      if (d.type === 'ready') this.post({ type: 'theme', mode: this.mode });
    });
    ext.runtime.onMessage.addListener((msg: ToContent | { type: 'extract' }, _sender, reply) => {
      if (msg.type === 'extract') {
        const p = extractPage();
        reply({ text: p.selection || p.text, title: p.title, url: p.url });
        return false;
      }
      if (msg.type === 'toggle-rail') {
        if (this.open) this.hide();
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
    if (this.s.theme.mode === 'page') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    }
  }
}

async function main() {
  if ((window as any).__marginRail) return;
  (window as any).__marginRail = true;
  const settings = await loadSettings();
  const rail = new Rail(settings);
  // Mini windows Margin opens for apps stay clean: no rail inside them.
  const info = (await send({ type: 'tab-info' })) as { popup?: boolean } | undefined;
  if (info?.popup) rail.disableHere();
}

if (window.top === window && document.documentElement && !(document.contentType && !/html/.test(document.contentType))) {
  void main();
}
