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

function frameFor(app: AppEntry): HTMLIFrameElement {
  let f = frames.get(app.id);
  if (!f) {
    const el = h('iframe', {
      src: app.url,
      title: app.name,
      allow: 'clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen',
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
    f = { el, lastShown: Date.now() };
    frames.set(app.id, f);
    framesHost.append(el);
  }
  return f.el;
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
export async function appBar(ctx: Ctx, appId?: string): Promise<HTMLElement> {
  const apps = ctx.settings.apps;
  const app = apps.find((a) => a.id === appId) ?? apps.find((a) => a.openIn === 'panel') ?? apps[0];
  if (!app) return h('div', { class: 'empty' }, 'No apps yet. Add some in settings.');
  // Sites that refuse to run inside any extension page (Gmail, X, Meta's apps):
  // Chrome keeps its sidebar to extension pages, so they get the docked side window.
  if (NO_FRAME.has(app.catalogId ?? '')) return sideWindowCard(ctx, app);
  const bar = h('div', { class: 'appbar' });
  // The rail (or the panel's own buttons list) already lists the apps: just name this one.
  bar.append(appFavicon(app, 'fav sm'), h('span', { class: 'app-title' }, app.name));
  bar.append(
    h('span', { style: { flex: '1' } }),
    iconButton('refresh', 'Reload', () => reload(app)),
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
    attach(app);
    return wrap;
  }
  attach(app);
  return bar;
}

let lastWindowed = '';


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

function attach(app: AppEntry) {
  frameFor(app);
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
