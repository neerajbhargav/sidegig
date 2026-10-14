// "Add this site": turn the page you're on into a rail app or a bookmark, or
// pick from suggested apps. One tap each.
import { ext, uid } from '../../shared/api.ts';
import { updateSettings } from '../../shared/storage.ts';
import { CATALOG } from '../../shared/catalog.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { h, favicon, iconButton, hostOf, toast, ico, appFavicon } from '../dom.ts';
import { type Ctx, activeTab, openOptions } from '../ctx.ts';

export async function addView(ctx: Ctx): Promise<HTMLElement> {
  const root = h('div', { class: 'app' });
  const pad = h('div', { class: 'pad' });
  const tab = await activeTab(ctx);
  const url = tab?.url && /^https?:/.test(tab.url) ? tab.url : '';

  if (url) {
    const origin = new URL(url).origin + '/';
    const already = ctx.settings.apps.some((a) => hostOf(a.url) === hostOf(url));
    const addApp = h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        disabled: already,
        onclick: async () => {
          await updateSettings((s) =>
            void s.apps.push({ id: uid('app_'), name: hostOf(url).split('.').slice(-2, -1)[0]?.replace(/^\w/, (c) => c.toUpperCase()) || hostOf(url), url: origin, openIn: 'panel', mobile: false, badge: true }),
          );
          toast('Added to your rail');
        },
      },
      ico('addSite', 16),
      already ? 'Already on your rail' : 'Add to rail',
    );
    const addBookmark = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: async () => {
          const s = ctx.settings;
          const parentId = s.stacks.activeSpace || s.stacks.spaces[0] || (await ext.bookmarks.getTree())[0].children?.[0]?.id || '1';
          await ext.bookmarks.create({ parentId, title: tab?.title || url, url });
          toast('Saved to stacks');
        },
      },
      ico('bookmarkAdd', 16),
      'Save to stacks',
    );
    pad.append(
      h('div', { class: 'label', style: { marginTop: '4px' } }, 'This site'),
      h(
        'div',
        { class: 'site-card' },
        favicon(url, tab?.title ?? hostOf(url)),
        h('div', { class: 'text' }, h('div', { class: 't' }, tab?.title || hostOf(url)), h('div', { class: 'm' }, hostOf(url))),
      ),
      h('div', { class: 'actions' }, addApp, addBookmark),
    );
  } else {
    pad.append(h('div', { class: 'empty' }, 'This page can’t be added. Pick an app below or add any site in settings.'));
  }

  const have = new Set(ctx.settings.apps.map((a) => a.catalogId ?? a.id));
  const suggestions = CATALOG.filter((c) => !have.has(c.id));
  if (suggestions.length) {
    pad.append(h('div', { class: 'label' }, h('span', {}, 'Suggested apps'), h('span', { class: 'grow' }), h('button', { class: 'link', type: 'button', onclick: () => openOptions('apps') }, 'Manage')));
    pad.append(
      h(
        'div',
        { class: 'tiles' },
        suggestions.map((c) =>
          h(
            'button',
            {
              class: 'tile',
              type: 'button',
              title: `Add ${c.name}`,
              onclick: async () => {
                await updateSettings((s) => void s.apps.push(appFromCatalog(c.id)));
                toast(`${c.name} added`);
              },
            },
            appFavicon(c),
            h('span', { class: 'name' }, c.name),
          ),
        ),
      ),
    );
  }

  root.append(
    h(
      'div',
      { class: 'bar' },
      iconButton('back', 'Back', () => ctx.go('home')),
      h('span', { class: 'title' }, 'Add to sidegig'),
      ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
    ),
    h('div', { class: 'scroll' }, pad),
  );
  return root;
}
