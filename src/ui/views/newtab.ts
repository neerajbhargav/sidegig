// The new tab: your day on the left (time, weather, calendar, focus timer,
// to-do, notes), one box in the middle to search or ask AI, with your apps and
// your edition under it, and your bookmarks on the right. Cards sit over the
// wallpaper as frosted glass, clear glass, or solid; each one can be turned off.
import { widgetGrid, type GridItem } from './ntgrid.ts';
import type { Settings } from '../../shared/types.ts';
import { keepReadable } from './ntlegible.ts';
import { ext } from '../../shared/api.ts';
import { getLocal, updateSettings, setLocal } from '../../shared/storage.ts';
import type { NtLook } from '../../shared/types.ts';
import type { Edition } from '../../shared/edition/types.ts';
import { h, ico } from '../dom.ts';
import { type Ctx, openOptions } from '../ctx.ts';
import { createSearch } from './search.ts';
import { shortCredit } from '../../shared/ntdata.ts';
import { editionSection } from './edition.ts';
import { aiParts } from './ntai.ts';
import { todoSection, launcherEl, voiceButton } from './ntwidgets.ts';
import { bookmarkShelf, calendarCard, greetingLine, notesCard, pomodoroCard, timeBlock, weatherCard } from './ntdash.ts';
import { wallpaperEl, addUpload, prepareImage, skipWall } from './ntwall.ts';
import { hideWall } from '../../shared/collect.ts';
import { customize } from './ntcustom.ts';
import { configureSound, play } from '../sound.ts';
import { detectBrowser, type DetectedBrowser } from '../browser.ts';

type Mode = 'home' | 'ai';
const getMode = (): Mode => {
  try {
    return localStorage.getItem('sidegig.ntMode') === 'ai' ? 'ai' : 'home';
  } catch {
    return 'home';
  }
};
const saveMode = (m: Mode) => {
  try {
    localStorage.setItem('sidegig.ntMode', m);
  } catch {
    /* fine */
  }
};


/** "auto" = match the browser (native); the others are sidegig's own studio looks. */
/** Text on the accent colour: whichever of near-black or white reads better on it. */
export function fitOnSignal() {
  const root = document.documentElement;
  root.style.removeProperty('--c-on-signal');
  if (!document.body) return;
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0;color:var(--c-signal)';
  document.body.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  if (!m) return;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(+m[0]) + 0.7152 * lin(+m[1]) + 0.0722 * lin(+m[2]);
  const onDark = (L + 0.05) / (0.0056 + 0.05); // against #111
  const onWhite = 1.05 / (L + 0.05);
  root.style.setProperty('--c-on-signal', onWhite >= onDark ? '#ffffff' : '#111111');
}

export function applyLook(look: NtLook, browser?: DetectedBrowser, accent = '', custom?: { bg: string; ink: string; accent: string }) {
  const root = document.documentElement;
  root.dataset.look = look === 'auto' ? 'native' : look;
  // Your own theme: three colours, the rest is mixed from them in CSS.
  for (const v of ['--c-bg', '--c-ink', '--c-signal']) root.style.removeProperty(v);
  if (look === 'custom' && custom) {
    root.style.setProperty('--c-bg', custom.bg);
    root.style.setProperty('--c-ink', custom.ink);
    root.style.setProperty('--c-signal', custom.accent);
    try {
      localStorage.setItem('sidegig.ntCustom', JSON.stringify(custom));
    } catch {
      /* fine */
    }
  }
  // From picture: the palette read from the current wallpaper (last one, until the new one is read).
  let picAccent = '';
  delete root.dataset.pal;
  if (look === 'picture') {
    try {
      const pal = JSON.parse(localStorage.getItem('sidegig.ntPicture') || 'null');
      if (pal?.bg) {
        root.style.setProperty('--c-bg', pal.bg);
        root.style.setProperty('--c-ink', pal.ink);
        picAccent = pal.accent;
        root.dataset.pal = pal.dark ? 'dark' : 'light';
      }
    } catch {
      /* fine */
    }
  }
  // Your accent wins; otherwise the theme's (custom and picture themes carry their own).
  const sig = accent || (look === 'custom' ? custom?.accent ?? '' : look === 'picture' ? picAccent : '');
  if (sig) root.style.setProperty('--c-signal', sig);
  else root.style.removeProperty('--c-signal');
  if (accent) root.dataset.accent = 'user';
  else delete root.dataset.accent;
  fitOnSignal();
  root.dataset.scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (browser) {
    root.dataset.browser = browser.id;
    // Arc shares the current space's colours: wear them.
    for (const [k, v] of Object.entries(browser.arcPalette ?? {})) root.style.setProperty(`--arc-${k}`, v);
  }
  try {
    localStorage.setItem('sidegig.ntLook', look);
  } catch {
    /* fine */
  }
}

// ---------------------------------------------------------------- top bar

/** Sound is opt-in, and the mute is always visible (Velvet's first rule). */
function soundToggle(ctx: Ctx): HTMLElement {
  const on = ctx.settings.newtab.sounds;
  return h(
    'button',
    {
      class: 'nt-gear',
      type: 'button',
      title: on ? 'Interface sounds on' : 'Interface sounds off',
      'aria-label': 'Interface sounds',
      'aria-pressed': String(on),
      onclick: () => {
        configureSound(!on, document.documentElement.dataset.look === 'native' ? 'velvet' : 'crisp');
        play(!on ? 'on' : 'off');
        void updateSettings((s) => void (s.newtab.sounds = !on));
      },
    },
    ico(on ? 'soundOn' : 'soundOff', 17),
  );
}

/** One quiet line under the greeting, key facts in ink, the rest in grey. */
async function briefEl(ctx: Ctx): Promise<HTMLElement | null> {
  const [ed, todos, badges] = await Promise.all([
    getLocal<Edition | null>('edition', null),
    getLocal<{ done: boolean }[]>('ntTodos', []),
    getLocal<Record<string, number>>('badges', {}),
  ]);
  const parts: (Node | string)[] = [];
  const add = (strong: string, rest: string) => {
    if (parts.length) parts.push(', ');
    parts.push(h('b', {}, strong), rest);
  };
  if (ctx.settings.edition.enabled && ed?.items.length) add(`${ed.items.length} picks`, ' for you');
  const open = ctx.settings.newtab.todo ? todos.filter((t) => !t.done).length : 0;
  if (open) add(`${open} ${open === 1 ? 'task' : 'tasks'}`, ' to do');
  const unread = ctx.settings.apps.reduce((n, a) => n + (a.badge && (badges[a.id] ?? 0) > 0 ? badges[a.id] : 0), 0);
  if (unread) add(`${unread} unread`, ' across your apps');
  if (!parts.length) return null;
  const last = parts.lastIndexOf(', ');
  if (last > 0) parts[last] = ' and ';
  return h('p', { class: 'nt-brief' }, ...parts);
}

export const brandName = (ctx: Ctx) => ctx.settings.newtab.title.trim() || 'sidegig';

/** The name in the corner. Click it to rename (Enter saves, Esc cancels); clear it to go back to sidegig. */
function brandEl(ctx: Ctx): HTMLElement {
  const word = h('span', { class: 'nt-word', title: 'Click to rename', role: 'button', tabindex: 0, 'aria-label': `${brandName(ctx)}. Click to rename`, dataset: { default: String(!ctx.settings.newtab.title.trim()) } }, brandName(ctx));
  const tag = ctx.settings.newtab.tag.trim();
  const start = () => {
    if (word.isContentEditable) return;
    word.contentEditable = 'plaintext-only';
    word.dataset.editing = 'true';
    word.focus();
    getSelection()?.selectAllChildren(word);
  };
  const finish = (save: boolean) => {
    if (!word.isContentEditable) return;
    word.contentEditable = 'false';
    delete word.dataset.editing;
    const next = (word.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!save) return void (word.textContent = brandName(ctx));
    word.textContent = next || 'sidegig';
    if (next !== ctx.settings.newtab.title.trim() && !(next === 'sidegig' && !ctx.settings.newtab.title)) {
      play('confirm');
      void updateSettings((s) => void (s.newtab.title = next === 'sidegig' ? '' : next));
    }
  };
  word.addEventListener('click', start);
  word.addEventListener('keydown', (e) => {
    if (!word.isContentEditable) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
      }
      return;
    }
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  word.addEventListener('blur', () => finish(true));
  return h('div', { class: 'nt-brand' }, word, tag ? h('span', { class: 'nt-tag' }, tag) : null);
}

/** Wallpaper credit, kept short (initials; the full name on hover and in the link), plus next and hide for collections. */
function wallCredit(ctx: Ctx, wall: HTMLElement): HTMLElement | null {
  const credit = wall.dataset.credit ?? '';
  const col = wall.dataset.collection;
  const pic = wall.dataset.pic;
  if (!shortCredit(credit) && !col) return null;
  const short = shortCredit(credit);
  const label = short
    ? wall.dataset.link
      ? h('a', { href: wall.dataset.link, target: '_blank', rel: 'noopener noreferrer', class: 'nt-credit', title: credit, 'aria-label': `Wallpaper: ${credit}` }, short || '©')
      : h('span', { class: 'nt-credit', title: credit, 'aria-label': `Wallpaper: ${credit}` }, short || '©')
    : null;
  return h(
    'span',
    { class: 'nt-wallbar' },
    label,
    col
      ? h(
          'button',
          {
            type: 'button',
            class: 'nt-gear',
            title: 'Next wallpaper',
            'aria-label': 'Next wallpaper',
            onclick: async () => {
              play('key');
              await skipWall(col);
              ctx.go('home');
            },
          },
          ico('next', 18),
        )
      : null,
    col && pic
      ? h(
          'button',
          {
            type: 'button',
            class: 'nt-gear',
            title: 'Not this one: never show it again',
            'aria-label': 'Hide this wallpaper',
            onclick: async () => {
              play('dismiss');
              await hideWall(pic, col);
              ctx.go('home');
            },
          },
          ico('notFor', 18),
        )
      : null,
  );
}

function topBar(ctx: Ctx, czButton: HTMLElement, wall: HTMLElement | null, arrange: HTMLElement): HTMLElement {
  return h(
    'header',
    { class: 'nt-top' },
    brandEl(ctx),
    h(
      'div',
      { class: 'nt-meta' },
      wall ? wallCredit(ctx, wall) : null,
      czButton,
      arrange,
      soundToggle(ctx),
      launcherEl(ctx.signal),
      h('button', { class: 'nt-gear', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: () => openOptions('newtab') }, ico('sliders', 18)),
    ),
  );
}

// ---------------------------------------------------------------- page

/** One-time choice: keep sidegig as the new tab, or go back to the browser's own. */
async function choiceCard(ctx: Ctx, browser: DetectedBrowser): Promise<HTMLElement | null> {
  if (await getLocal('ntChoiceMade', false)) return null;
  const card = h('div', { class: 'nt-choice', role: 'region', 'aria-label': 'New tab choice' });
  const done = () => {
    void setLocal('ntChoiceMade', true);
    card.remove();
  };
  card.append(
    h('div', { class: 'nt-choice-text' }, h('b', {}, 'This is sidegig’s new tab.'), ` Keep it, or go back to ${browser.browser}’s own. You can change this any time in settings.`),
    h(
      'div',
      { class: 'nt-choice-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: done }, 'Keep sidegig'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: async () => {
            await setLocal('ntChoiceMade', true);
            await updateSettings((s) => void (s.newtab.enabled = false));
            try {
              localStorage.setItem('sidegig.ntOff', '1');
              localStorage.setItem('sidegig.ntFallback', browser.ntp);
            } catch {
              /* fine */
            }
            const tab = await ext.tabs.getCurrent().catch(() => undefined);
            if (tab?.id !== undefined) await ext.tabs.update(tab.id, { url: browser.ntp });
          },
        },
        `Use ${browser.browser}’s new tab`,
      ),
    ),
  );
  return card;
}

/** A two-way switch with a pill that slides to the chosen side. */
function segmented<T extends string>(label: string, options: [T, string, string][], value: T, onPick: (v: T) => void): { el: HTMLElement; set: (v: T) => void } {
  const el = h('div', { class: 'nt-seg', role: 'tablist', 'aria-label': label, style: { '--n': String(options.length) } });
  const btns = options.map(([v, text, icon]) => h('button', { type: 'button', role: 'tab', dataset: { v }, onclick: () => onPick(v) }, icon ? ico(icon, 18) : null, h('span', {}, text)));
  el.append(...btns);
  const set = (v: T) => {
    const i = Math.max(0, options.findIndex(([o]) => o === v));
    el.style.setProperty('--i', String(i));
    btns.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  };
  set(value);
  return { el, set };
}

export async function newtabView(ctx: Ctx): Promise<HTMLElement> {
  const signal = ctx.signal ?? new AbortController().signal;
  const browser = await detectBrowser();
  if (signal.aborted) return h('div');
  const n = ctx.settings.newtab;
  const w = n.widgets;
  applyLook(n.look, browser, n.accent, n.custom);
  configureSound(n.sounds, document.documentElement.dataset.look === 'native' ? 'velvet' : 'crisp');
  document.body.toggleAttribute('data-calm', n.calmImages);
  const root = h('div', { class: 'nt2', dataset: { panels: n.panels } });

  // ------------------------------------------------ the box: search, or ask AI
  const input = h('input', { class: 'nt-input', placeholder: 'Search or type a URL', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search or type a URL' });
  const results = h('div', { class: 'results nt-results', hidden: true });
  const aiOn = n.aiTab;
  let mode: Mode = aiOn ? getMode() : 'home';
  const ai = aiOn ? await aiParts(ctx, () => void setMode('home')) : null;
  const searchGo = h('button', { type: 'button', class: 'ask-go round', title: 'Search', 'aria-label': 'Search', onclick: () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }, ico('forward', 20));
  const feedOn = w.feed && ctx.settings.edition.enabled;
  const feedToggle = h(
    'button',
    {
      type: 'button',
      class: 'ask-feed',
      role: 'switch',
      'aria-checked': String(feedOn),
      title: feedOn ? 'Hide your edition' : 'Show your edition: a short, finite set of picks from what you’re into',
      onclick: () => {
        play(feedOn ? 'off' : 'on');
        void updateSettings((s) => {
          s.newtab.widgets.feed = !feedOn;
          if (!feedOn) s.edition.enabled = true;
        });
      },
    },
    ico('feed', 18),
    h('span', {}, 'For you'),
    h('i', { class: 'ask-sw', 'aria-hidden': 'true' }),
  );
  const seg = aiOn
    ? segmented<Mode>('Search or ask', [['home', 'Search', ''], ['ai', 'Ask', '']], mode, (m) => void setMode(m))
    : null;
  const searchVoice = voiceButton(input);
  // Which controls belong to which side of the switch.
  for (const [el, side] of [[input, 'home'], [searchVoice, 'home'], [searchGo, 'home'], [feedToggle, 'home'], [ai?.box, 'ai'], [ai?.voice, 'ai'], [ai?.send, 'ai'], [ai?.pickers, 'ai']] as const) if (el) el.dataset.for = side;
  const greet = greetingLine(ctx);
  const box = h(
    'div',
    { class: 'nt-ask nt-card' },
    greet ? h('div', { class: 'ask-head' }, greet) : null,
    h('div', { class: 'ask-row' }, input, ai?.box ?? null, searchVoice, ai?.voice ?? null),
    h('div', { class: 'ask-bar' }, seg?.el ?? null, ai?.pickers ?? null, h('span', { class: 'ask-gap' }), feedToggle, searchGo, ai?.send ?? null),
  );

  // ------------------------------------------------ the grid
  // Every widget sits on one 12 × 8 grid that fills the screen (see ntgrid.ts);
  // the edition, when it's on, follows underneath.
  const feedHost = h('div', { class: 'nt-feed' });
  const off = (put: (s: Settings) => void) => () => void updateSettings(put);
  const items: GridItem[] = [];
  const push = (id: GridItem['id'], label: string, el: HTMLElement | null, more: Partial<GridItem> = {}) => el && items.push({ id, label, el, ...more });
  push('clock', 'Clock', n.clock ? timeBlock(ctx, w.brief ? await briefEl(ctx) : null) : null, { remove: off((s) => void (s.newtab.clock = false)) });
  push('weather', 'Weather', w.weather ? weatherCard(ctx) : null, { expandable: true, remove: off((s) => void (s.newtab.widgets.weather = false)) });
  push('search', 'Search', h('div', { class: 'gw-search' }, box, results, ai ? h('div', { class: 'nt-ai-host' }, ai.below) : null));
  push('bookmarks', 'Bookmarks', w.bookmarks ? await bookmarkShelf(ctx) : null, { remove: off((s) => void (s.newtab.widgets.bookmarks = false)) });
  push('calendar', 'Calendar', w.calendar ? calendarCard(ctx) : null, { expandable: true, remove: off((s) => void (s.newtab.widgets.calendar = false)) });
  push('pomodoro', 'Pomodoro', w.pomodoro ? await pomodoroCard(ctx) : null, { expandable: true, remove: off((s) => void (s.newtab.widgets.pomodoro = false)) });
  push('todo', 'To-do', await todoSection(ctx), { expandable: true, remove: off((s) => void (s.newtab.todo = false)) });
  push('notes', 'Notes', w.notes ? await notesCard(ctx) : null, { expandable: true, remove: off((s) => void (s.newtab.widgets.notes = false)) });
  const grid = widgetGrid(ctx, items);
  const choice = await choiceCard(ctx, browser);
  const dash = h('div', { class: 'nt-dash' }, choice ? h('div', { class: 'nt-choice-float' }, choice) : null, grid.el, h('div', { class: 'nt-below' }, feedHost));

  const setMode = async (m: Mode) => {
    if (!aiOn) m = 'home';
    if (m !== mode) play(m === 'ai' ? 'on' : 'off');
    mode = m;
    saveMode(m);
    root.dataset.mode = m;
    document.documentElement.dataset.mode = m;
    seg?.set(m);
    if (m === 'ai') ai?.box.focus({ preventScroll: true });
    else input.focus({ preventScroll: true });
  };

  const wall = await wallpaperEl(ctx);
  if (wall) root.dataset.wall = n.background.kind;
  const cz = customize(ctx);
  if (wall) root.append(wall);
  const arrange = h('button', { type: 'button', class: 'nt-gear', title: 'Arrange widgets', 'aria-label': 'Arrange widgets', onclick: () => grid.edit(!grid.editing()) }, ico('arrange', 18));
  root.append(h('div', { class: 'nt-grain', 'aria-hidden': 'true' }), h('div', { class: 'nt-page' }, topBar(ctx, cz.button, wall, arrange), dash), cz.panel);
  if (ai) root.append(ai.chat.view);
  root.dataset.mode = mode;
  document.documentElement.dataset.mode = mode;

  await createSearch(ctx, input, results, () => {
    input.value = '';
    results.hidden = true;
    root.dataset.typing = 'false';
  });
  input.addEventListener('input', () => {
    const has = !!input.value.trim();
    results.hidden = !has;
    root.dataset.typing = String(has);
  });
  // Typing a URL goes straight there; Tab on an empty box switches to AI.
  input.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !input.value && aiOn) {
        e.preventDefault();
        void setMode('ai');
        return;
      }
      if (e.key === 'Escape') {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.blur();
      }
    },
    true,
  );

  // The edition, under your apps.
  if (feedOn) void editionSection(ctx).then((ed) => (feedHost.classList.add('nt-card'), feedHost.append(ed)));

  // Clear widgets read the wallpaper behind them to stay readable.
  keepReadable(root, wall, n.panels === 'clear', signal);
  addEventListener('nt-arrange', () => grid.edit(true), { signal });

  // Keys: "/" to search, 1–9 to open the first bookmarks (when you're not typing).
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) return;
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    if (e.key === '/') {
      e.preventDefault();
      if (mode === 'ai') ai?.box.focus();
      else input.focus();
    } else if (/^[1-9]$/.test(e.key) && mode === 'home') {
      const key = root.querySelectorAll<HTMLButtonElement>('.nt-shelf .nt-key[aria-keyshortcuts]')[Number(e.key) - 1];
      if (key) {
        e.preventDefault();
        key.classList.add('pressed');
        key.click();
      }
    }
  };
  addEventListener('keydown', onKey, { signal });
  addEventListener('keyup', () => root.querySelectorAll('.nt-key.pressed').forEach((k) => k.classList.remove('pressed')), { signal });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyLook(n.look, browser, n.accent, n.custom), { signal });

  // Drop any picture (or an image link) on the page to make it the background.
  const dropHint = h('div', { class: 'nt-drop', hidden: true }, h('span', {}, 'Drop to make this your background'));
  root.append(dropHint);
  let depth = 0;
  const hasImage = (e: DragEvent) => [...(e.dataTransfer?.items ?? [])].some((i) => i.type.startsWith('image/') || i.type === 'text/uri-list');
  addEventListener('dragenter', (e) => {
    if (!root.isConnected || !hasImage(e)) return;
    depth++;
    dropHint.hidden = false;
  }, { signal });
  addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      dropHint.hidden = true;
    }
  }, { signal });
  addEventListener('dragover', (e) => root.isConnected && hasImage(e) && e.preventDefault(), { signal });
  addEventListener('drop', async (e) => {
    if (!root.isConnected || !hasImage(e)) return;
    e.preventDefault();
    depth = 0;
    dropHint.hidden = true;
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    try {
      if (file) {
        const up = await addUpload(await prepareImage(file));
        play('confirm');
        await updateSettings((s) => void (s.newtab.background = { ...s.newtab.background, kind: 'upload', ref: up.id }));
        return;
      }
      const url = e.dataTransfer?.getData('text/uri-list')?.split('\n')[0]?.trim();
      if (url && /^https?:\/\//.test(url)) {
        play('confirm');
        await updateSettings((s) => void (s.newtab.background = { ...s.newtab.background, kind: 'url', ref: url }));
      }
    } catch {
      play('fail');
    }
  }, { signal });
  if (mode === 'ai') void setMode('ai');
  else requestAnimationFrame(() => input.focus({ preventScroll: true }));
  return root;
}
