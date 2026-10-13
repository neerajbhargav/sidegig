// The buttons list inside the browser sidebar panel, Opera style: icons down
// the outer edge, the open app or view right beside them.
import { getLocal } from '../../shared/storage.ts';
import { badgeLabel } from '../../shared/badge.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { catalogById } from '../../shared/catalog.ts';
import type { StatusCard } from '../../shared/types.ts';
import { h, ico, favicon } from '../dom.ts';
import { type Ctx, type ViewName, openApp, send } from '../ctx.ts';

export async function panelRail(ctx: Ctx, current: { name: ViewName; app?: string }): Promise<HTMLElement> {
  const [badges, cards, seen] = await Promise.all([
    getLocal<Record<string, number>>('badges', {}),
    getLocal<StatusCard[]>('status', []),
    getLocal<Record<string, string>>('statusSeen', {}),
  ]);
  const s = ctx.settings;
  const news = cards.some((c) => s.status[c.id] && c.signature && seen[c.id] !== c.signature);
  const btn = (label: string, content: (Node | null)[], onClick: () => void, pressed = false, extra = '') =>
    h('button', { class: `pitem ${extra}`.trim(), type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(pressed), onclick: onClick }, ...content);

  const nav = h('nav', { class: 'prail', 'aria-label': 'sidegig' });
  nav.append(btn('Home', [ico('logo', 22)], () => ctx.go('home'), current.name === 'home'), h('div', { class: 'psep' }));

  const apps = h('div', { class: 'papps' });
  for (const a of s.apps) {
    const n = a.badge ? badges[a.id] ?? 0 : 0;
    apps.append(
      btn(
        a.name,
        [favicon(a.url, a.name, 'fav pfav'), n !== 0 ? h('span', { class: 'badge', ...(n < 0 ? { 'data-dot': '' } : {}) }, badgeLabel(n)) : null],
        () => openApp(ctx, a),
        current.name === 'app' && current.app === a.id,
      ),
    );
  }
  apps.append(btn('Add this site', [ico('plus', 20)], () => ctx.go('add'), current.name === 'add', 'quiet'));
  nav.append(apps, h('div', { class: 'psep' }));

  const aiId = s.ai.defaultApp;
  const ai = s.apps.find((a) => a.id === aiId) ?? (catalogById(aiId) ? appFromCatalog(aiId) : undefined);
  nav.append(
    btn('Search', [ico('search', 20)], () => ctx.go('search'), current.name === 'search'),
    btn('Status', [ico('pulse', 20)], () => ctx.go('status'), current.name === 'status', news ? 'glow' : ''),
    btn(`Ask ${ai?.name ?? 'AI'} about this page`, [ico('sparkle', 20)], () => {
      if (!ai) return ctx.go('settings');
      void send({ type: 'ask-page' }).catch(() => undefined);
      ctx.go('app', { app: ai.id });
    }),
    h('div', { class: 'pspacer' }),
    btn('Settings', [ico('sliders', 20)], () => ctx.go('settings'), current.name === 'settings'),
  );
  return nav;
}
