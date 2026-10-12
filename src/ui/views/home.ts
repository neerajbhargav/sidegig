// Home: apps, bookmark stacks (Dia/Arc style), tabs in this window, workspaces.
import { ext, features } from '../../shared/api.ts';
import { getLocal, setLocal, updateSettings } from '../../shared/storage.ts';
import { badgeLabel } from '../../shared/badge.ts';
import type { Workspace } from '../../shared/types.ts';
import { h, ico, iconButton, favicon, faviconOnly, hostOf, toast, ago, keys } from '../dom.ts';
import { type Ctx, openApp, openUrl, switchTo, activeTab, send, openOptions } from '../ctx.ts';

type Node = chrome.bookmarks.BookmarkTreeNode;

export async function spacesFor(ctx: Ctx): Promise<Node[]> {
  const ids = ctx.settings.stacks.spaces;
  if (ids.length) {
    const nodes = await ext.bookmarks.get(ids as [string, ...string[]]).catch(() => [] as Node[]);
    if (nodes.length) return nodes;
  }
  const [tree] = await ext.bookmarks.getTree();
  const bar = tree.children?.[0];
  return bar ? [bar] : [];
}

const openStacks = new Set<string>();
let openStacksLoaded = false;
async function loadOpenStacks() {
  if (openStacksLoaded) return;
  openStacksLoaded = true;
  for (const id of await getLocal<string[]>('openStacks', [])) openStacks.add(id);
}
const saveOpenStacks = () => void setLocal('openStacks', [...openStacks]);

export function bookmarkRow(ctx: Ctx, b: Node): HTMLElement {
  const row = h(
    'button',
    { class: 'row', type: 'button', title: b.url, onclick: (e: MouseEvent) => openUrl(ctx, b.url!, e), onauxclick: (e: MouseEvent) => e.button === 1 && openUrl(ctx, b.url!, e) },
    favicon(b.url!, b.title || hostOf(b.url!), 'fav sm'),
    h('span', { class: 'text' }, h('span', { class: 't' }, b.title || hostOf(b.url!)), h('span', { class: 'm' }, hostOf(b.url!))),
  );
  return row;
}

export function stackEl(ctx: Ctx, folder: Node): HTMLElement {
  const wrap = h('div', { class: 'stack' });
  const faces = h('span', { class: 'faces' });
  const count = h('span', { class: 'stack-count' });
  const chev = ico('down', 16);
  chev.classList.add('chev');
  const head = h('button', { class: 'stack-head', type: 'button', 'aria-expanded': 'false' }, faces, h('span', { class: 'stack-name' }, folder.title || 'Untitled'), count, chev);
  const body = h('div', { class: 'stack-body', hidden: true });
  wrap.append(head, body);
  let rendered = false;
  let kids: Node[] = [];
  const setOpen = (open: boolean) => {
    wrap.classList.toggle('open', open);
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    if (open && !rendered) {
      rendered = true;
      for (const f of kids.filter((k) => !k.url)) body.append(stackEl(ctx, f));
      for (const l of kids.filter((k) => k.url)) body.append(bookmarkRow(ctx, l));
      if (!kids.length) body.append(h('div', { class: 'subtle', style: { padding: '6px 8px' } }, 'Empty folder'));
    }
  };
  head.addEventListener('click', () => {
    const open = !wrap.classList.contains('open');
    if (open) openStacks.add(folder.id);
    else openStacks.delete(folder.id);
    saveOpenStacks();
    setOpen(open);
  });
  void ext.bookmarks.getChildren(folder.id).then((children) => {
    kids = children;
    count.textContent = String(children.length);
    const links = children.filter((k) => k.url);
    for (const l of links.slice(0, 4)) {
      const img = faviconOnly(l.url!);
      if (img) faces.append(img);
    }
    if (!links.length) faces.append(ico('folder', 16));
    // If every icon fails to load, show a folder instead of an empty gap.
    setTimeout(() => !faces.childElementCount && faces.append(ico('folder', 16)), 1500);
    if (openStacks.has(folder.id)) setOpen(true);
  });
  return wrap;
}

export function appTiles(ctx: Ctx, badges: Record<string, number>): HTMLElement {
  const grid = h('div', { class: 'tiles' });
  for (const app of ctx.settings.apps) {
    const n = app.badge ? badges[app.id] ?? 0 : 0;
    grid.append(
      h(
        'button',
        { class: 'tile', type: 'button', title: app.name, onclick: () => openApp(ctx, app) },
        favicon(app.url, app.name),
        h('span', { class: 'name' }, app.name),
        n !== 0 ? h('span', { class: 'badge' }, badgeLabel(n) || ' ') : null,
      ),
    );
  }
  return grid;
}

async function spaceSection(ctx: Ctx, rerender: () => void): Promise<HTMLElement> {
  const sec = h('section');
  const spaces = await spacesFor(ctx);
  if (!spaces.length) return sec;
  const active = spaces.find((s) => s.id === ctx.settings.stacks.activeSpace) ?? spaces[0];
  const addPage = async () => {
    const tab = await activeTab(ctx);
    if (!tab?.url || !/^https?:/.test(tab.url)) return toast('This page can’t be bookmarked');
    await ext.bookmarks.create({ parentId: active.id, title: tab.title || tab.url, url: tab.url });
    toast(`Added to ${active.title || 'stacks'}`);
    rerender();
  };
  sec.append(
    h(
      'div',
      { class: 'label' },
      h('span', {}, spaces.length > 1 ? 'Spaces' : active.title || 'Bookmarks'),
      h('span', { class: 'grow' }),
      h('button', { class: 'link', type: 'button', onclick: addPage }, '+ Add page'),
    ),
  );
  if (spaces.length > 1) {
    sec.append(
      h(
        'div',
        { class: 'chips' },
        spaces.map((s) =>
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'aria-pressed': String(s.id === active.id),
              onclick: () => void updateSettings((st) => void (st.stacks.activeSpace = s.id)),
            },
            s.title || 'Untitled',
          ),
        ),
      ),
    );
  }
  const children = await ext.bookmarks.getChildren(active.id);
  const links = children.filter((c) => c.url);
  const folders = children.filter((c) => !c.url);
  if (links.length) {
    // Saved sites as an icon grid, like Opera's speed dial in the sidebar.
    const pins = h('div', { class: 'tiles icons', style: { marginTop: '6px' } });
    for (const l of links.slice(0, 40)) {
      pins.append(
        h(
          'button',
          { class: 'tile', type: 'button', title: l.title || l.url, 'aria-label': l.title || hostOf(l.url!), onclick: (e: MouseEvent) => openUrl(ctx, l.url!, e), onauxclick: (e: MouseEvent) => e.button === 1 && openUrl(ctx, l.url!, e) },
          favicon(l.url!, l.title),
        ),
      );
    }
    sec.append(pins);
  }
  const list = h('div', { style: { marginTop: '6px' } });
  for (const f of folders) list.append(stackEl(ctx, f));
  if (!children.length) list.append(h('div', { class: 'empty' }, 'No bookmarks here yet. Use “+ Add page” or pick folders as spaces in settings.'));
  sec.append(list);
  return sec;
}

async function tabsSection(ctx: Ctx): Promise<HTMLElement> {
  const sec = h('section');
  const here = await activeTab(ctx);
  const windowId = here?.windowId ?? ctx.windowId;
  const tabs = windowId !== undefined ? await ext.tabs.query({ windowId }) : [];
  const list = h('div');
  const render = (all: chrome.tabs.Tab[]) => {
    list.textContent = '';
    for (const t of all) {
      const url = t.url ?? '';
      const fav =
        t.favIconUrl && /^(https?|data):/.test(t.favIconUrl)
          ? (() => {
              const img = h('img', { class: 'fav sm', src: t.favIconUrl, alt: '' });
              img.addEventListener('error', () => img.replaceWith(favicon(url, t.title ?? '', 'fav sm')), { once: true });
              return img;
            })()
          : favicon(url, t.title ?? '', 'fav sm');
      const row = h(
        'button',
        { class: `row${t.active ? ' current' : ''}`, type: 'button', title: url, onclick: () => switchTo(t) },
        fav,
        h('span', { class: 'text' }, h('span', { class: 't' }, t.title || hostOf(url)), h('span', { class: 'm' }, `${t.discarded ? 'asleep · ' : ''}${hostOf(url)}`)),
        h(
          'span',
          { class: 'end' },
          iconButton('close', 'Close tab', (e) => {
            e.stopPropagation();
            if (t.id !== undefined) void ext.tabs.remove(t.id).then(() => row.remove());
          }),
        ),
      );
      row.querySelector('.iconbtn')?.classList.add('x');
      if (t.pinned) row.querySelector('.m')!.textContent = `pinned · ${hostOf(url)}`;
      list.append(row);
    }
  };
  render(tabs);
  sec.append(
    h(
      'div',
      { class: 'label' },
      h('span', {}, `Tabs`),
      h('span', { class: 'subtle' }, String(tabs.length)),
      h('span', { class: 'grow' }),
      h(
        'button',
        {
          class: 'link',
          type: 'button',
          title: 'Unload background tabs to free memory',
          onclick: async () => {
            const n = (await send({ type: 'sleep-tabs' }).catch(() => 0)) as number;
            toast(n ? `Put ${n} tab${n === 1 ? '' : 's'} to sleep` : 'Nothing to put to sleep');
          },
        },
        'Sleep others',
      ),
    ),
    list,
  );
  return sec;
}

async function workspacesSection(ctx: Ctx, rerender: () => void): Promise<HTMLElement> {
  const sec = h('section');
  const all = await getLocal<Workspace[]>('workspaces', []);
  const form = h('form', { class: 'opt', hidden: true, style: { gap: '6px' } });
  const name = h('input', { class: 'text-input', placeholder: 'Name this window', style: { flex: '1' } });
  form.append(name, h('button', { class: 'btn primary', type: 'submit' }, 'Save'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await send({ type: 'save-workspace', name: name.value });
    toast('Window saved');
    rerender();
  });
  sec.append(
    h(
      'div',
      { class: 'label' },
      h('span', {}, 'Workspaces'),
      h('span', { class: 'grow' }),
      h('button', { class: 'link', type: 'button', onclick: () => ((form.hidden = !form.hidden), name.focus()) }, '+ Save window'),
    ),
    form,
  );
  if (!all.length) sec.append(h('div', { class: 'subtle', style: { padding: '2px 2px 6px' } }, 'Save this window’s tabs and bring them back later.'));
  for (const ws of all) {
    sec.append(
      h(
        'button',
        { class: 'row', type: 'button', onclick: () => void send({ type: 'restore-workspace', id: ws.id }) },
        ico('window', 16),
        h('span', { class: 'text' }, h('span', { class: 't' }, ws.name), h('span', { class: 'm' }, `${ws.tabs.length} tabs · ${ago(ws.created)}`)),
        h(
          'span',
          { class: 'end' },
          iconButton('trash', 'Delete workspace', async (e) => {
            e.stopPropagation();
            await setLocal('workspaces', all.filter((w) => w.id !== ws.id));
            rerender();
          }),
        ),
      ),
    );
  }
  return sec;
}

export async function homeView(ctx: Ctx): Promise<HTMLElement> {
  await loadOpenStacks();
  const root = h('div', { class: 'app' });
  const body = h('div', { class: 'scroll' });
  const rerender = async () => {
    const [badges] = await Promise.all([getLocal<Record<string, number>>('badges', {})]);
    const pad = h('div', { class: 'pad' });
    // In the drawer the rail already shows your apps right next to it.
    if (ctx.kind !== 'drawer') {
      pad.append(
        h(
          'div',
          { class: 'label', style: { marginTop: '4px' } },
          h('span', {}, 'Apps'),
          h('span', { class: 'grow' }),
          h('button', { class: 'link', type: 'button', onclick: () => openOptions('apps') }, 'Edit'),
        ),
        appTiles(ctx, badges),
      );
    }
    pad.append(await spaceSection(ctx, rerender));
    if (ctx.kind !== 'newtab') pad.append(await tabsSection(ctx), await workspacesSection(ctx, rerender));
    body.replaceChildren(pad);
  };
  const search = h('div', { class: 'field' }, ico('search', 16), h('input', {
    class: 'input',
    placeholder: 'Search everything',
    onfocus: () => ctx.go('search'),
    oninput: (e: Event) => ctx.go('search', { q: (e.target as HTMLInputElement).value }),
  }), h('span', { class: 'kbd' }, keys('K')));
  const bar = h(
    'div',
    { class: 'bar' },
    h('span', { class: 'title' }, 'Margin'),
    iconButton('pulse', 'Status', () => ctx.go('status')),
    iconButton('sliders', 'Settings', () => ctx.go('settings')),
    ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
  );
  root.append(bar, search, body);
  await rerender();
  // Keep tabs and bookmarks fresh while the view is on screen.
  refreshHome = () => root.isConnected && void rerender();
  wireLiveUpdates();
  return root;
}

let refreshHome: () => unknown = () => undefined;
let wired = false;
function wireLiveUpdates() {
  if (wired) return;
  wired = true;
  let t = 0;
  const soon = () => {
    clearTimeout(t);
    t = window.setTimeout(() => refreshHome(), 250);
  };
  ext.tabs.onRemoved.addListener(soon);
  ext.tabs.onCreated.addListener(soon);
  ext.tabs.onActivated.addListener(soon);
  ext.tabs.onUpdated.addListener((_id, info) => (info.title || info.discarded !== undefined) && soon());
  ext.bookmarks.onCreated.addListener(soon);
  ext.bookmarks.onRemoved.addListener(soon);
  ext.bookmarks.onChanged.addListener(soon);
}
