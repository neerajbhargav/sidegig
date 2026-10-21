// Status cards: quiet until there is something new, like Kitbar's cards.
import { getLocal, setLocal } from '../../shared/storage.ts';
import type { StatusCard } from '../../shared/types.ts';
import { h, ico, iconButton, ago } from '../dom.ts';
import { type Ctx, openUrl, send, openOptions } from '../ctx.ts';

function cardEl(ctx: Ctx, c: StatusCard, isNew: boolean): HTMLElement {
  const card = h('div', { class: `card${isNew ? '' : ' quiet'}` });
  card.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title' }, c.title, isNew ? h('span', { class: 'new-dot', title: 'New since you last looked' }) : null),
      c.value ? h('span', { class: 'card-value' }, c.value) : null,
    ),
    h('div', { class: 'card-detail' }, c.error ? c.error : c.detail),
  );
  for (const it of c.items) {
    card.append(
      h(
        'button',
        { class: 'row', type: 'button', title: it.url, onclick: (e: MouseEvent) => openUrl(ctx, it.url, e) },
        h('span', { class: `dot ${it.state ?? ''}` }),
        h('span', { class: 'text' }, h('span', { class: 't' }, it.title), h('span', { class: 'm' }, it.meta)),
      ),
    );
  }
  if (c.error) {
    card.append(h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn', type: 'button', onclick: () => openOptions('status') }, 'Open settings')));
  } else {
    card.append(
      h(
        'div',
        { class: 'subtle', style: { marginTop: '6px', display: 'flex' } },
        h('span', { style: { flex: '1' } }, `Updated ${ago(c.updatedAt)}`),
        h('a', { href: c.url, onclick: (e: MouseEvent) => (e.preventDefault(), openUrl(ctx, c.url, e)) }, 'Open'),
      ),
    );
  }
  return card;
}

export async function statusView(ctx: Ctx): Promise<HTMLElement> {
  const root = h('div', { class: 'app' });
  const body = h('div', { class: 'pad' });
  const render = async (cards?: StatusCard[]) => {
    const list = cards ?? (await getLocal<StatusCard[]>('status', []));
    const seen = await getLocal<Record<string, string>>('statusSeen', {});
    body.textContent = '';
    const enabled = ctx.settings.status;
    if (!enabled.github && !enabled.vercel && !enabled.gmail) {
      body.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { style: { marginBottom: '12px' } }, 'See GitHub reviews, Vercel deploys and unread Gmail at a glance. Cards stay quiet until something changes.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openOptions('status') }, 'Turn on cards'),
        ),
      );
      return;
    }
    if (!list.length) body.append(h('div', { class: 'empty' }, 'Checking…'));
    const fresh = list.filter((c) => c.signature && seen[c.id] !== c.signature);
    const quiet = list.filter((c) => !fresh.includes(c));
    for (const c of fresh) body.append(cardEl(ctx, c, true));
    for (const c of quiet) body.append(cardEl(ctx, c, false));
    // Looking at the cards counts as seeing them.
    await setLocal('statusSeen', Object.fromEntries(list.map((c) => [c.id, c.signature])));
  };
  const refresh = iconButton('refresh', 'Refresh', async () => {
    refresh.classList.add('spinning');
    refresh.setAttribute('aria-busy', 'true');
    const cards = (await send({ type: 'refresh-status' }).catch(() => undefined)) as StatusCard[] | undefined;
    refresh.classList.remove('spinning');
    refresh.removeAttribute('aria-busy');
    await render(cards);
  });
  root.append(
    h(
      'div',
      { class: 'bar' },
      iconButton('back', 'Back', () => ctx.go('home')),
      h('span', { class: 'title' }, 'Status'),
      refresh,
      ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
    ),
    h('div', { class: 'scroll' }, body),
  );
  await render();
  void ico;
  return root;
}
