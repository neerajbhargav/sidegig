// New tab page: a big search box, your apps, today's edition and your stacks.
import { ext } from '../../shared/api.ts';
import { getLocal, updateSettings } from '../../shared/storage.ts';
import { h, ico, favicon } from '../dom.ts';
import { type Ctx, openUrl } from '../ctx.ts';
import { createSearch } from './search.ts';
import { appTiles, spacesFor, stackEl } from './home.ts';
import { editionSection } from './edition.ts';

export async function newtabView(ctx: Ctx): Promise<HTMLElement> {
  const root = h('div', { class: 'nt' });
  const wrap = h('div', { class: 'wrap' });
  const input = h('input', { class: 'input', placeholder: 'Search or type a URL', autocomplete: 'off', spellcheck: 'false', autofocus: true });
  const results = h('div', { class: 'results', hidden: true });
  const content = h('div');
  wrap.append(h('div', { class: 'field' }, ico('search', 18), input), results, content);
  root.append(wrap);

  const ui = await createSearch(ctx, input, results, () => {
    input.value = '';
    results.hidden = true;
    content.hidden = false;
  });
  input.addEventListener('input', () => {
    const has = !!input.value.trim();
    results.hidden = !has;
    content.hidden = has;
  });
  // Typing a URL goes straight there.
  input.addEventListener(
    'keydown',
    (e) => {
      const v = input.value.trim();
      if (e.key === 'Enter' && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v) && !/\s/.test(v)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        location.href = /^https?:\/\//.test(v) ? v : `https://${v}`;
      }
    },
    true,
  );
  void ui;

  const badges = await getLocal<Record<string, number>>('badges', {});
  content.append(h('div', { class: 'nt-apps' }, appTiles(ctx, badges)));
  if (ctx.settings.edition.enabled) {
    root.classList.add('with-ed');
    content.append(await editionSection(ctx));
  }
  const spaces = await spacesFor(ctx);
  const active = spaces.find((s) => s.id === ctx.settings.stacks.activeSpace) ?? spaces[0];
  if (active) {
    if (spaces.length > 1) {
      content.append(
        h(
          'div',
          { class: 'chips', style: { margin: '24px 0 10px' } },
          spaces.map((s) =>
            h('button', { class: 'chip', type: 'button', 'aria-pressed': String(s.id === active.id), onclick: () => void updateSettings((st) => void (st.stacks.activeSpace = s.id)) }, s.title || 'Untitled'),
          ),
        ),
      );
    } else content.append(h('div', { class: 'label', style: { marginTop: '24px' } }, active.title || 'Bookmarks'));
    const kids = await ext.bookmarks.getChildren(active.id);
    // Speed dial: saved sites with names, like Opera's start page.
    const loose = kids.filter((k) => k.url);
    if (loose.length) {
      content.append(
        h(
          'div',
          { class: 'tiles' },
          loose.slice(0, 40).map((l) =>
            h(
              'button',
              { class: 'tile', type: 'button', title: l.url, onclick: (e: MouseEvent) => openUrl(ctx, l.url!, e), onauxclick: (e: MouseEvent) => e.button === 1 && openUrl(ctx, l.url!, e) },
              favicon(l.url!, l.title),
              h('span', { class: 'name' }, l.title || l.url!),
            ),
          ),
        ),
      );
    }
    const grid = h('div', { class: 'stacks-grid' });
    for (const f of kids.filter((k) => !k.url)) grid.append(stackEl(ctx, f));
    content.append(grid);
  }
  requestAnimationFrame(() => input.focus());
  return root;
}
