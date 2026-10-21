// App viewer for the browser sidebar (and the drawer for "drawer" apps).
// Frames live in one container that is never moved in the DOM (moving an
// iframe reloads it), so chats stay alive while you switch apps. Frames you
// haven't looked at for 30 minutes are unloaded to free memory.
import { ext } from '../../shared/api.ts';
import { updateSettings } from '../../shared/storage.ts';
import type { AppEntry } from '../../shared/types.ts';
import { h, iconButton, appFavicon } from '../dom.ts';
import { type Ctx, send } from '../ctx.ts';
import { NO_FRAME } from '../../shared/catalog.ts';

const SLEEP_MS = 30 * 60_000;
const frames = new Map<string, { el: HTMLIFrameElement; lastShown: number }>();
export const framesHost = h('div', { class: 'frames', hidden: true });

/** Frames that have said hello (the frame helper runs inside them), by app id. */
const greeted = new Set<string>();
addEventListener('message', (e) => {
  const d = e.data as { ns?: string; type?: string } | null;
  if (!d || d.ns !== 'sidegig-frame' || d.type !== 'hello') return;
  for (const [id, f] of frames) if (f.el.contentWindow === e.source) greeted.add(id);
});

function frameFor(ctx: Ctx, app: AppEntry): HTMLIFrameElement {
  let f = frames.get(app.id);
  if (!f) {
    // The worker lets sign-in redirects frame only in the sidebar and in tabs whose drawer asked.
    if (ctx.kind === 'drawer') void send({ type: 'drawer-frames' }).catch(() => undefined);
    const el = h('iframe', {
      // The frame helper (content/framefit.ts) only acts in frames with this name.
      name: `sidegig-app-${app.id}`,
      title: app.name,
      allow: 'clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen; storage-access',
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
    f = { el, lastShown: Date.now() };
    frames.set(app.id, f);
    framesHost.append(el);
    // Sites with service workers (Gmail, X) answer from them with "don't frame me";
    // clear the worker first, then load. Others load straight away.
    if (NO_FRAME.has(app.catalogId ?? '')) void send({ type: 'clear-sw', url: app.url }).catch(() => undefined).finally(() => (el.src = app.url));
    else el.src = app.url;
  }
  return f.el;
}

/** If the frame never checks in, it was refused: offer the side window. */
function watchFrame(ctx: Ctx, app: AppEntry, host: HTMLElement) {
  const started = Date.now();
  const check = () => {
    if (!host.isConnected || greeted.has(app.id)) return;
    if (Date.now() - started < 12_000) return void setTimeout(check, 1000);
    host.querySelector('.frame-help')?.remove();
    host.append(
      h(
        'div',
        { class: 'frame-help' },
        h('span', {}, `${app.name} is taking a while.`),
        h('button', { type: 'button', class: 'btn', onclick: () => (greeted.delete(app.id), frames.get(app.id)?.el.remove(), frames.delete(app.id), void ctx.go('app', { app: app.id })) }, 'Reload'),
        h('button', { type: 'button', class: 'btn', onclick: () => void send({ type: 'open-app', appId: app.id, url: app.url, openIn: 'window', side: ctx.settings.rail.side }) }, 'Open in a side window'),
      ),
    );
  };
  setTimeout(check, 1000);
}

function reload(app: AppEntry) {
  const f = frames.get(app.id);
  if (f) f.el.src = app.url;
}

setInterval(() => {
  for (const [id, f] of frames) {
    if (!f.el.hidden || Date.now() - f.lastShown < SLEEP_MS) continue;
    f.el.remove();
    frames.delete(id);
  }
}, 60_000);

export function showFrames(show: boolean) {
  framesHost.hidden = !show;
}

/** Returns the app bar and brings the app's frame to the front. */
/** `url`: a page of this app to show (a link rule sent it here). */
export async function appBar(ctx: Ctx, appId?: string, url?: string): Promise<HTMLElement> {
  const apps = ctx.settings.apps;
  const app = apps.find((a) => a.id === appId) ?? apps.find((a) => a.openIn === 'panel') ?? apps[0];
  if (!app) return h('div', { class: 'empty' }, 'No apps yet. Add some in settings.');
  // Only the in-page drawer can't host frame-hostile sites (its top is a web page,
  // so they'd be signed out): those get the docked side window. The sidebar loads them.
  if (NO_FRAME.has(app.catalogId ?? '') && ctx.kind !== 'panel') return sideWindowCard(ctx, app);
  const bar = h('div', { class: 'appbar' });
  // The rail (or the panel's own buttons list) already lists the apps: just name this one.
  bar.append(appFavicon(app, 'fav sm'), h('span', { class: 'app-title' }, app.name));
  bar.append(
    h('span', { style: { flex: '1' } }),
    iconButton('refresh', 'Reload', () => reload(app)),
    // No phone layout for Gmail: its user agent stays as is (see background/dnr.ts).
    ...(app.url.startsWith('https://mail.google.com/')
      ? []
      : [
          iconButton(
            'phone',
            app.mobile ? 'Use desktop layout' : 'Use mobile layout',
            async () => {
              await updateSettings((s) => {
                const x = s.apps.find((a) => a.id === app.id);
                if (x) x.mobile = !x.mobile;
              });
              // Give the background a moment to swap network rules, then reload.
              setTimeout(() => reload(app), 300);
            },
            app.mobile,
          ),
        ]),
    iconButton('window', 'Open as mini window', () => void send({ type: 'open-app', appId: app.id, url: app.url, openIn: 'window', side: ctx.settings.rail.side })),
    iconButton('external', 'Open in a tab', () => void ext.tabs.create({ url: app.url })),
  );
  if (ctx.kind === 'drawer') {
    // In a page the app can't see your sign-in for most sites; the side panel can.
    bar.insertBefore(
      iconButton('sidebar', 'Open in the browser’s side panel (keeps you signed in)', () => {
        void send({ type: 'open-app', appId: app.id, url: app.url, openIn: 'panel', side: ctx.settings.rail.side });
        ctx.close();
      }),
      bar.querySelector('[aria-label="Open as mini window"]'),
    );
    bar.append(iconButton('close', 'Close (Esc)', () => ctx.close()));
  }
  if (ctx.kind === 'drawer' && needsSignIn(app)) {
    // Browsers keep your sign-ins away from apps embedded in other sites' pages.
    const note = h(
      'div',
      { class: 'signin-note' },
      h('span', {}, `${app.name} needs your sign-in, and browsers don’t share it with apps inside a page. The side panel keeps you signed in.`),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: async () => {
            await updateSettings((s) => {
              const x = s.apps.find((a) => a.id === app.id);
              if (x) x.openIn = 'panel';
            });
            void send({ type: 'open-app', appId: app.id, url: app.url, openIn: 'panel', side: ctx.settings.rail.side });
            ctx.close();
          },
        },
        'Always use the side panel',
      ),
    );
    const wrap = h('div', { class: 'appbar-wrap' }, bar, note);
    attach(ctx, app, url);
    return wrap;
  }
  attach(ctx, app, url);
  if (ctx.kind === 'panel') watchFrame(ctx, app, bar);
  return bar;
}

let lastWindowed = '';

const sameSite = (url: string, appUrl: string) => {
  try {
    const u = new URL(url);
    const host = new URL(appUrl).hostname.replace(/^www\./, '');
    return /^https?:$/.test(u.protocol) && (u.hostname === host || u.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};


function sideWindowCard(ctx: Ctx, app: AppEntry): HTMLElement {
  const open = () => void send({ type: 'open-app', appId: app.id, url: app.url, openIn: 'window', side: ctx.settings.rail.side });
  // Open it right away the first time you pick it (not on every refresh of this view).
  if (lastWindowed !== app.id) {
    lastWindowed = app.id;
    open();
  }
  for (const f of frames.values()) f.el.hidden = true;
  return h(
    'div',
    { class: 'sidewin' },
    h('div', { class: 'sidewin-icon' }, appFavicon(app, 'fav')),
    h('h2', { class: 'sidewin-title' }, `${app.name} is open beside this window`),
    h('p', { class: 'sidewin-text' }, `${app.name} doesn’t allow itself to run inside another page, so sidegig gives it a slim side window, signed in, right next to your browser. Your browser makes room for it and gets the space back when you close it.`),
    h('button', { class: 'btn primary sidewin-btn', type: 'button', onclick: open }, `Show ${app.name}`),
  );
}

function attach(ctx: Ctx, app: AppEntry, url?: string) {
  const el = frameFor(ctx, app);
  if (url && sameSite(url, app.url)) el.src = url;
  for (const [id, f] of frames) {
    const show = id === app.id;
    if (show) f.lastShown = Date.now();
    f.el.hidden = !show;
  }
}

/** Built-in apps you sign in to (all but Translate). Custom sites usually work in a page. */
function needsSignIn(app: AppEntry): boolean {
  const cat = app.catalogId ?? '';
  return !!cat && cat !== 'translate';
}
