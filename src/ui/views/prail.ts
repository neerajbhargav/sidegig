// The buttons list inside the browser sidebar panel, Opera style: icons down
// the outer edge, the open app or view right beside them.
import { getLocal } from '../../shared/storage.ts';
import { badgeLabel } from '../../shared/badge.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { catalogById } from '../../shared/catalog.ts';
import type { StatusCard } from '../../shared/types.ts';
import { h, ico, appFavicon } from '../dom.ts';
import { type Ctx, type ViewName, openApp, send } from '../ctx.ts';
import { arrowNav } from '../../shared/arrownav.ts';

export async function panelRail(ctx: Ctx, current: { name: ViewName; app?: string }): Promise<HTMLElement> {
  const [badges, cards, seen] = await Promise.all([
    getLocal<Record<string, number>>('badges', {}),
    getLocal<StatusCard[]>('status', []),
    getLocal<Record<string, string>>('statusSeen', {}),
  ]);
  const s = ctx.settings;
  const news = cards.some((c) => s.status[c.id] && c.signature && seen[c.id] !== c.signature);
  const btn = (label: string, content: (Node | null)[], onClick: () => void, pressed = false, extra = '', mark: Record<string, string> = {}) =>
    h('button', { class: `pitem ${extra}`.trim(), type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(pressed), onclick: onClick, dataset: mark }, ...content);

  const nav = h('nav', { class: 'prail', 'aria-label': 'sidegig' });
  arrowNav(nav);
  nav.append(btn('Home', [ico('logo', 24)], () => ctx.go('home'), current.name === 'home', '', { view: 'home' }), h('div', { class: 'psep' }));

  const apps = h('div', { class: 'papps', role: 'group', 'aria-label': 'Pinned apps' });
  for (const a of s.apps) {
    const n = a.badge ? badges[a.id] ?? 0 : 0;
    apps.append(
      btn(
        a.name,
        [appFavicon(a, 'fav pfav'), n !== 0 ? h('span', { class: 'badge', ...(n < 0 ? { 'data-dot': '' } : {}) }, badgeLabel(n)) : null],
        () => openApp(ctx, a),
        current.name === 'app' && current.app === a.id,
        'app',
        { app: a.id },
      ),
    );
  }
  apps.append(btn('Add this site', [ico('plus', 20)], () => ctx.go('add'), current.name === 'add', 'quiet', { view: 'add' }));
  nav.append(apps, h('div', { class: 'psep' }));

  const aiId = s.ai.defaultApp;
  const ai = s.apps.find((a) => a.id === aiId) ?? (catalogById(aiId) ? appFromCatalog(aiId) : undefined);
  nav.append(
    btn('Search', [ico('search', 20)], () => ctx.go('search'), current.name === 'search', '', { view: 'search' }),
    btn('Assistant', [ico('forum', 20)], () => ctx.go('chat'), current.name === 'chat', '', { view: 'chat' }),
    btn('Status', [ico('pulse', 20)], () => ctx.go('status'), current.name === 'status', news ? 'glow' : '', { view: 'status' }),
    btn(`Ask ${ai?.name ?? 'AI'} about this page`, [ico('ask', 20)], () => {
      if (!ai) return ctx.go('settings');
      void send({ type: 'ask-page' }).catch(() => undefined);
      ctx.go('app', { app: ai.id });
    }),
    h('div', { class: 'pspacer' }),
    btn('Settings', [ico('sliders', 20)], () => ctx.go('settings'), current.name === 'settings', '', { view: 'settings' }),
  );
  return nav;
}

/** Mark the current view or app without rebuilding the rail (icons stay put, focus stays). */
export function markRail(nav: HTMLElement, current: { name: ViewName; app?: string }) {
  for (const b of nav.querySelectorAll<HTMLElement>('button[data-app], button[data-view]')) {
    const on = b.dataset.app ? current.name === 'app' && current.app === b.dataset.app : current.name === b.dataset.view;
    b.setAttribute('aria-pressed', String(on));
  }
}

/** Unread counts, in place. */
export function paintRailBadges(nav: HTMLElement, ctx: Ctx, badges: Record<string, number>) {
  for (const b of nav.querySelectorAll<HTMLElement>('button[data-app]')) {
    const app = ctx.settings.apps.find((a) => a.id === b.dataset.app);
    const n = app?.badge ? badges[app.id] ?? 0 : 0;
    let el = b.querySelector<HTMLElement>('.badge');
    if (!n) {
      el?.remove();
      continue;
    }
    if (!el) b.append((el = h('span', { class: 'badge' })));
    el.toggleAttribute('data-dot', n < 0);
    el.textContent = badgeLabel(n);
  }
}
