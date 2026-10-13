// App viewer for the browser sidebar (and the drawer for "drawer" apps).
// Frames live in one container that is never moved in the DOM (moving an
// iframe reloads it), so chats stay alive while you switch apps. Frames you
// haven't looked at for 30 minutes are unloaded to free memory.
import { ext } from '../../shared/api.ts';
import { getLocal, updateSettings } from '../../shared/storage.ts';
import { badgeLabel } from '../../shared/badge.ts';
import type { AppEntry } from '../../shared/types.ts';
import { h, favicon, iconButton } from '../dom.ts';
import { type Ctx, send } from '../ctx.ts';

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
  const badges = await getLocal<Record<string, number>>('badges', {});
  const bar = h('div', { class: 'appbar' });
  if (ctx.kind === 'panel') {
    bar.append(favicon(app.url, app.name, 'fav sm'), h('span', { class: 'app-title' }, app.name));
  } else bar.append(iconButton('logo', 'sidegig home', () => ctx.go('home')), h('span', { class: 'sep' }));
  for (const a of ctx.kind === 'panel' ? [] : apps.filter((x) => x.openIn === 'panel' || x.openIn === 'drawer' || x.id === app.id)) {
    const n = a.badge ? badges[a.id] ?? 0 : 0;
    bar.append(
      h(
        'button',
        { class: 'iconbtn', type: 'button', title: a.name, 'aria-label': a.name, 'aria-pressed': String(a.id === app.id), onclick: () => ctx.go('app', { app: a.id }) },
        favicon(a.url, a.name, 'fav sm'),
        n !== 0 ? h('span', { class: 'badge' }, badgeLabel(n) || ' ') : null,
      ),
    );
  }
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
  if (ctx.kind === 'drawer') bar.append(iconButton('close', 'Close (Esc)', () => ctx.close()));

  frameFor(app);
  for (const [id, f] of frames) {
    const show = id === app.id;
    if (show) f.lastShown = Date.now();
    f.el.hidden = !show;
  }
  return bar;
}
