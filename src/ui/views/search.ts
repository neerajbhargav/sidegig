// Command palette: one box for tabs, apps, bookmarks, history and commands.
import { engineUrl } from '../../shared/ntdata.ts';
import { ext, TARGET } from '../../shared/api.ts';
import { rank } from '../../shared/fuzzy.ts';
import { updateSettings } from '../../shared/storage.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import { catalogById } from '../../shared/catalog.ts';
import { h, ico, iconButton, favicon, hostOf, toast, appFavicon } from '../dom.ts';
import { type Ctx, openApp, openUrl, switchTo, send, openOptions, activeTab } from '../ctx.ts';

type Kind = 'Tab' | 'App' | 'Bookmark' | 'History' | 'Command' | 'Web';
interface Result { kind: Kind; title: string; meta: string; url?: string; icon: () => HTMLElement; run: (e?: MouseEvent | KeyboardEvent) => unknown }

interface Data { tabs: chrome.tabs.Tab[]; bookmarks: { title: string; url: string; path: string }[] }

async function loadData(): Promise<Data> {
  const [tabs, [tree]] = await Promise.all([ext.tabs.query({}), ext.bookmarks.getTree()]);
  const bookmarks: Data['bookmarks'] = [];
  const walk = (n: chrome.bookmarks.BookmarkTreeNode, path: string[]) => {
    if (n.url) bookmarks.push({ title: n.title, url: n.url, path: path.join(' / ') });
    for (const c of n.children ?? []) walk(c, n.title ? [...path, n.title] : path);
  };
  walk(tree, []);
  return { tabs, bookmarks };
}

function webSearch(ctx: Ctx, q: string) {
  // Your pick of engine, if you made one; otherwise the browser's own default.
  const picked = engineUrl(ctx.settings.newtab.engine, q);
  if (picked) return openUrl(ctx, picked);
  const s = (ext as any).search;
  if (TARGET === 'firefox' && s?.search) return s.search({ query: q });
  if (s?.query) return s.query({ text: q, disposition: ctx.kind === 'newtab' ? 'CURRENT_TAB' : 'NEW_TAB' });
  return openUrl(ctx, `https://www.google.com/search?q=${encodeURIComponent(q)}`);
}

function commands(ctx: Ctx): Result[] {
  const s = ctx.settings;
  const aiId = s.ai.defaultApp;
  const ai = s.apps.find((a) => a.id === aiId) ?? (catalogById(aiId) ? appFromCatalog(aiId) : undefined);
  const c = (title: string, meta: string, iconName: string, run: Result['run']): Result => ({ kind: 'Command', title, meta, icon: () => ico(iconName, 16), run });
  const list: Result[] = [];
  if (ai) {
    list.push(
      c(`Ask ${ai.name} about this page`, 'Sends the page (or your selection) to AI', 'sparkle', () => {
        if (ctx.kind === 'drawer') return ctx.toRail({ type: 'ask-ai' });
        void send({ type: 'ask-page' } as any);
        if (ctx.kind === 'panel') ctx.go('app', { app: ai.id });
        else openApp(ctx, ai);
      }),
    );
  }
  list.push(
    c(s.rail.mode === 'docked' ? 'Undock the rail (show on hover)' : 'Dock the rail to the side', 'Rail', 'sidebar', () =>
      updateSettings((st) => void (st.rail.mode = st.rail.mode === 'docked' ? 'hover' : 'docked')),
    ),
    c('Add this page to stacks', 'Bookmarks', 'bookmark', async () => {
      const tab = await activeTab(ctx);
      if (!tab?.url || !/^https?:/.test(tab.url)) return toast('This page can’t be bookmarked');
      const parentId = s.stacks.activeSpace ?? s.stacks.spaces[0] ?? (await ext.bookmarks.getTree())[0].children?.[0]?.id ?? '1';
      await ext.bookmarks.create({ parentId, title: tab.title || tab.url, url: tab.url });
      toast('Added to stacks');
    }),
    c('Save this window as a workspace', 'Workspaces', 'save', async () => {
      await send({ type: 'save-workspace', name: '' });
      toast('Window saved');
    }),
    c('Put background tabs to sleep', 'Frees memory', 'sleep', async () => {
      const n = (await send({ type: 'sleep-tabs' }).catch(() => 0)) as number;
      toast(n ? `Put ${n} tabs to sleep` : 'Nothing to put to sleep');
    }),
    c('Switch to dark theme', 'Appearance', 'moon', () => updateSettings((st) => void (st.theme.mode = 'dark'))),
    c('Switch to light theme', 'Appearance', 'moon', () => updateSettings((st) => void (st.theme.mode = 'light'))),
    c('Match the system theme', 'Appearance', 'moon', () => updateSettings((st) => void (st.theme.mode = 'system'))),
    c('Status', 'GitHub, Vercel, Gmail', 'pulse', () => ctx.go('status')),
    c('Quick settings', 'Rail, theme', 'sliders', () => ctx.go('settings')),
    c('All settings', 'Apps, AI, status, rules', 'sliders', () => openOptions()),
  );
  return list;
}

export interface SearchUi { input: HTMLInputElement; list: HTMLElement; set(q: string): void }

/** Wire an input + list into a palette. Shared by the drawer, panel and new tab page. */
export async function createSearch(ctx: Ctx, input: HTMLInputElement, list: HTMLElement, onEscape: () => void): Promise<SearchUi> {
  const data = await loadData();
  const cmds = commands(ctx);
  let results: Result[] = [];
  let active = 0;
  let seq = 0;

  const tabResult = (t: chrome.tabs.Tab): Result => ({
    kind: 'Tab',
    title: t.title || t.url || 'Tab',
    meta: hostOf(t.url ?? ''),
    url: t.url,
    icon: () => favicon(t.url ?? '', t.title ?? '', 'fav sm'),
    run: () => switchTo(t),
  });

  const draw = () => {
    list.textContent = '';
    let lastKind: Kind | null = null;
    results.forEach((r, i) => {
      if (r.kind !== lastKind) {
        lastKind = r.kind;
        list.append(h('div', { class: 'label' }, h('span', {}, r.kind === 'History' ? 'History' : r.kind === 'Web' ? 'Web' : `${r.kind}s`)));
      }
      const row = h(
        'button',
        {
          class: `row${i === active ? ' active' : ''}`,
          type: 'button',
          title: r.url ?? r.title,
          onclick: (e: MouseEvent) => r.run(e),
          onmousemove: () => {
            if (active !== i) {
              active = i;
              highlight();
            }
          },
        },
        r.icon(),
        h('span', { class: 'text' }, h('span', { class: 't' }, r.title), r.meta ? h('span', { class: 'm' }, r.meta) : null),
      );
      list.append(row);
    });
    if (!results.length) list.append(h('div', { class: 'empty' }, 'No matches'));
  };
  const highlight = () => {
    list.querySelectorAll('.row').forEach((el, i) => el.classList.toggle('active', i === active));
    list.querySelectorAll('.row')[active]?.scrollIntoView({ block: 'nearest' });
  };

  const update = async (q: string) => {
    const my = ++seq;
    active = 0;
    if (!q.trim()) {
      const recent = [...data.tabs].sort((a, b) => ((b as any).lastAccessed ?? 0) - ((a as any).lastAccessed ?? 0)).slice(0, 8);
      results = [...recent.map(tabResult), ...cmds.slice(0, 5)];
      return draw();
    }
    const tabs = rank(data.tabs, q, (t) => [[t.title ?? '', 1], [t.url ?? '', 0.6]], 6).map((r) => tabResult(r.item));
    const apps = rank(ctx.settings.apps, q, (a) => [[a.name, 1.2], [a.url, 0.5]], 4).map(({ item: a }): Result => ({
      kind: 'App',
      title: a.name,
      meta: `Opens in ${a.openIn === 'panel' ? 'sidebar' : a.openIn}`,
      url: a.url,
      icon: () => appFavicon(a, 'fav sm'),
      run: () => openApp(ctx, a),
    }));
    const seen = new Set([...data.tabs.map((t) => t.url)]);
    const bms = rank(data.bookmarks, q, (b) => [[b.title, 1], [b.url, 0.6], [b.path, 0.4]], 24)
      .filter((r) => !seen.has(r.item.url) && (seen.add(r.item.url), true))
      .slice(0, 8)
      .map(({ item: b }): Result => ({ kind: 'Bookmark', title: b.title || hostOf(b.url), meta: b.path || hostOf(b.url), url: b.url, icon: () => favicon(b.url, b.title, 'fav sm'), run: (e) => openUrl(ctx, b.url, e) }));
    const cmd = rank(cmds, q, (c) => [[c.title, 1], [c.meta, 0.4]], 4).map((r) => r.item);
    const web: Result = { kind: 'Web', title: `Search the web for “${q.trim()}”`, meta: '', icon: () => ico('search', 16), run: () => webSearch(ctx, q.trim()) };
    results = [...tabs, ...apps, ...bms, ...cmd, web];
    draw();
    const hist = await ext.history.search({ text: q, maxResults: 40, startTime: 0 }).catch(() => []);
    if (my !== seq) return;
    const histResults = rank(hist.filter((x) => x.url && !seen.has(x.url)), q, (x) => [[x.title ?? '', 1], [x.url ?? '', 0.6]], 8).map(({ item: x }): Result => ({
      kind: 'History',
      title: x.title || hostOf(x.url!),
      meta: hostOf(x.url!),
      url: x.url,
      icon: () => favicon(x.url!, x.title ?? '', 'fav sm'),
      run: (e) => openUrl(ctx, x.url!, e),
    }));
    if (histResults.length) {
      results = [...tabs, ...apps, ...bms, ...histResults, ...cmd, web];
      draw();
    }
  };

  input.addEventListener('input', () => void update(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
      highlight();
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      active = Math.max(0, active - 1);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) void r.run(e);
      else if (input.value.trim()) void webSearch(ctx, input.value.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (input.value) {
        input.value = '';
        void update('');
      } else onEscape();
    }
  });
  return { input, list, set: (q) => ((input.value = q), void update(q)) };
}

export async function searchView(ctx: Ctx, q = ''): Promise<HTMLElement> {
  const root = h('div', { class: 'app' });
  const input = h('input', { class: 'input', placeholder: 'Search tabs, bookmarks, history, apps', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'pad' });
  root.append(
    h(
      'div',
      { class: 'bar' },
      iconButton('back', 'Back', () => ctx.go('home')),
      h('span', { class: 'title' }, 'Search'),
      ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
    ),
    h('div', { class: 'field' }, ico('search', 16), input),
    h('div', { class: 'scroll' }, list),
  );
  const ui = await createSearch(ctx, input, list, () => (ctx.kind === 'drawer' ? ctx.close() : ctx.go('home')));
  ui.set(q);
  requestAnimationFrame(() => input.focus());
  return root;
}
