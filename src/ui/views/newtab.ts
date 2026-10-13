// New tab page, "NTP–1": an instrument panel rather than a feed. A big quiet
// clock, a little display that reads out today's edition, search, your apps as
// keys (press 1–9), the edition itself, and your bookmarks on a shelf below.
import { ext } from '../../shared/api.ts';
import { getLocal, onLocalChanged, updateSettings } from '../../shared/storage.ts';
import { badgeLabel } from '../../shared/badge.ts';
import type { AppEntry, NtLook } from '../../shared/types.ts';
import type { Edition, SavedItem } from '../../shared/edition/types.ts';
import { ED_KINDS, KIND_LABEL } from '../../shared/edition/types.ts';
import { h, ico, favicon, keys } from '../dom.ts';
import { type Ctx, openUrl, openApp, openOptions } from '../ctx.ts';
import { createSearch } from './search.ts';
import { spacesFor, stackEl } from './home.ts';
import { editionSection, KIND_COLOR } from './edition.ts';
import { aiView } from './ntai.ts';
import { greetingEl, analogClockEl, weatherEl, todoSection, launcherEl, addKey, voiceButton, wallpaperEl } from './ntwidgets.ts';
import { detectBrowser, type DetectedBrowser } from '../browser.ts';
import { setLocal } from '../../shared/storage.ts';

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


const pad = (n: number) => String(n).padStart(2, '0');

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}
const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);

/** "auto" = match the browser (native); the others are sidegig's own studio looks. */
export function applyLook(look: NtLook, browser?: DetectedBrowser, accent = '') {
  const root = document.documentElement;
  root.dataset.look = look === 'auto' ? 'native' : look;
  if (accent) root.style.setProperty('--c-signal', accent);
  else root.style.removeProperty('--c-signal');
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

function lookSwitch(ctx: Ctx): HTMLElement {
  const cur = ctx.settings.newtab.look;
  const opts: [NtLook, string][] = [
    ['auto', 'Match browser'],
    ['paper', 'Paper (studio)'],
    ['night', 'Night (studio)'],
    ['ultramarine', 'Ultramarine (studio)'],
  ];
  return h(
    'div',
    { class: 'nt-switch', role: 'radiogroup', 'aria-label': 'Look' },
    opts.map(([v, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(cur === v),
          title: label,
          'aria-label': label,
          dataset: { v },
          onclick: () => {
            applyLook(v);
            void updateSettings((s) => void (s.newtab.look = v));
          },
        },
        h('span', { class: 'nt-sw-dot' }),
      ),
    ),
  );
}

function topBar(ctx: Ctx): HTMLElement {
  const d = new Date();
  const code = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ·  W${pad(isoWeek(d))}  ·  D${String(dayOfYear(d)).padStart(3, '0')}`;
  return h(
    'header',
    { class: 'nt-top' },
    h('div', { class: 'nt-brand' }, h('span', { class: 'nt-word' }, 'sidegig'), h('span', { class: 'nt-tag' }, 'ntp–1')),
    h('div', { class: 'nt-ascii', 'aria-hidden': 'true' }, '/\\-_=+|<  -/=  ~:*-/  ·  ·  ·'),
    h(
      'div',
      { class: 'nt-meta' },
      h('span', { class: 'nt-code' }, code),
      lookSwitch(ctx),
      launcherEl(),
      h('button', { class: 'nt-gear', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: () => openOptions('newtab') }, ico('sliders', 16)),
    ),
  );
}

// ---------------------------------------------------------------- hero

function clockEl(ctx: Ctx): HTMLElement {
  if (ctx.settings.newtab.clockStyle === 'analog') {
    const date = h('div', { class: 'nt-date' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
    return h('div', { class: 'nt-clock analog' }, greetingEl(ctx), analogClockEl(), date, weatherEl(ctx));
  }
  const time = h('div', { class: 'nt-time' });
  const date = h('div', { class: 'nt-date' });
  const paint = () => {
    const d = new Date();
    const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
    const hm = parts.filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal').map((p) => p.value).join('').trim();
    const ampm = parts.find((p) => p.type === 'dayPeriod')?.value;
    time.replaceChildren(hm.replace(/\s+$/, ''), ampm ? h('span', { class: 'nt-ampm' }, ampm.toLowerCase()) : '');
    date.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };
  paint();
  // Tick on the minute, not every second: a new tab should be still.
  const next = () => setTimeout(() => (time.isConnected ? (paint(), next()) : undefined), 60_000 - (Date.now() % 60_000) + 50);
  next();
  return h('div', { class: 'nt-clock' }, greetingEl(ctx), time, date, weatherEl(ctx));
}

/** The little screen: reads out today's edition like an OP-1 display. */
function displayEl(ctx: Ctx): HTMLElement {
  const screen = h('div', { class: 'nt-screen', role: 'status', 'aria-live': 'polite' });
  const paint = async () => {
    const [ed, st, saved, profile] = await Promise.all([
      getLocal<Edition | null>('edition', null),
      getLocal<{ building?: boolean } | null>('edStatus', null),
      getLocal<SavedItem[]>('edSaved', []),
      getLocal<{ interests?: unknown[] } | null>('edProfile', null),
    ]);
    const rows: HTMLElement[] = [];
    const head = (l: string, r: string) => h('div', { class: 'scr-row scr-head' }, h('span', {}, l), h('span', {}, r));
    if (!ctx.settings.edition.enabled) {
      rows.push(head('Edition', 'off'), h('div', { class: 'scr-big' }, 'quiet'), h('div', { class: 'scr-row dim' }, 'Turn it on in settings'));
    } else if (!profile?.interests?.length) {
      rows.push(head('Edition', '—'), h('div', { class: 'scr-big' }, 'no signal'), h('div', { class: 'scr-row dim' }, 'Tell it what you’re into ↓'));
    } else if (!ed) {
      rows.push(head('Edition', 'tuning'), h('div', { class: 'scr-big blink' }, 'tuning…'));
    } else {
      const max = Math.max(1, ...ED_KINDS.map((k) => ed.items.filter((i) => i.kind === k).length));
      rows.push(head(`Edition ${pad(ed.no ?? 1)}`, new Date(ed.built).getHours() < 12 ? 'am' : 'pm'));
      for (const k of ED_KINDS) {
        const n = ed.items.filter((i) => i.kind === k).length;
        if (!n) continue;
        rows.push(
          h(
            'div',
            { class: 'scr-row', style: { '--c': KIND_COLOR[k] } },
            h('span', { class: 'scr-k' }, KIND_LABEL[k]),
            h('span', { class: 'scr-bar', 'aria-hidden': 'true' }, Array.from({ length: 6 }, (_, j) => h('i', { class: j < Math.round((n / max) * 6) ? 'on' : '' }))),
            h('span', { class: 'scr-n' }, pad(n)),
          ),
        );
      }
      const next = new Date(ed.built + ctx.settings.edition.refreshHours * 3_600_000);
      rows.push(
        h(
          'div',
          { class: 'scr-row scr-foot' },
          h('span', {}, st?.building ? h('b', { class: 'led busy' }) : h('b', { class: 'led' }), st?.building ? 'Tuning' : `Next ${pad(next.getHours())}:${pad(next.getMinutes())}`),
          h('span', {}, `Saved ${pad(saved.length)}`),
        ),
      );
    }
    screen.replaceChildren(...rows);
  };
  void paint();
  for (const k of ['edition', 'edStatus', 'edSaved', 'edProfile']) onLocalChanged(k, () => screen.isConnected && void paint());
  return h(
    'button',
    {
      class: 'nt-display',
      type: 'button',
      title: 'Jump to the edition',
      onclick: () => document.querySelector('.ed')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    h('span', { class: 'nt-display-label', 'aria-hidden': 'true' }, 'display'),
    screen,
  );
}

// ---------------------------------------------------------------- keys

/** From a new tab, a shortcut opens right here (like any start page). Shift-click opens it in the sidebar instead. */
function launch(ctx: Ctx, app: AppEntry, e?: MouseEvent | KeyboardEvent) {
  if (e?.shiftKey && !(e.metaKey || e.ctrlKey)) return openApp(ctx, app);
  void openUrl(ctx, app.url, e);
}

function appKeys(ctx: Ctx, badges: Record<string, number>): HTMLElement {
  const row = h('div', { class: 'nt-keys', role: 'toolbar', 'aria-label': 'Shortcuts' });
  ctx.settings.apps.forEach((app, i) => {
    const n = app.badge ? badges[app.id] ?? 0 : 0;
    const num = i < 9 ? String(i + 1) : '';
    row.append(
      h(
        'button',
        {
          class: 'nt-key',
          type: 'button',
          title: `${app.name}${num ? `  (${num})` : ''}. Shift-click: open in the sidebar`,
          'aria-keyshortcuts': num || undefined,
          onclick: (e: MouseEvent) => launch(ctx, app, e),
          onauxclick: (e: MouseEvent) => e.button === 1 && launch(ctx, app, e),
        },
        h('span', { class: 'nt-cap' }, num ? h('span', { class: 'nt-num' }, num) : null, favicon(app.url, app.name, 'fav'), n !== 0 ? h('span', { class: 'nt-led', ...(n < 0 ? { 'data-dot': '' } : {}) }, n > 0 ? badgeLabel(n) : '') : null),
        h('span', { class: 'nt-label' }, app.name),
      ),
    );
  });
  row.append(addKey(ctx));
  return row;
}

// ---------------------------------------------------------------- shelf

async function shelf(ctx: Ctx): Promise<HTMLElement | null> {
  const spaces = await spacesFor(ctx);
  const active = spaces.find((s) => s.id === ctx.settings.stacks.activeSpace) ?? spaces[0];
  if (!active) return null;
  const sec = h('section', { class: 'nt-shelf ed-sec' });
  sec.append(
    h(
      'div',
      { class: 'ed-sec-h' },
      h('span', { class: 'sec-no' }),
      h('span', { class: 'sec-dot', style: { '--c': 'var(--c-mute)' } }),
      h('span', { class: 'sec-name' }, 'Bookmarks'),
      h('span', { class: 'sec-rule' }),
      spaces.length > 1
        ? h(
            'span',
            { class: 'nt-spaces' },
            spaces.map((s) =>
              h('button', { type: 'button', class: 'nt-space', 'aria-pressed': String(s.id === active.id), onclick: () => void updateSettings((st) => void (st.stacks.activeSpace = s.id)) }, s.title || 'Untitled'),
            ),
          )
        : h('span', { class: 'sec-count' }, active.title || 'Bookmarks'),
    ),
  );
  const kids = await ext.bookmarks.getChildren(active.id);
  const loose = kids.filter((k) => k.url);
  if (loose.length) {
    sec.append(
      h(
        'div',
        { class: 'nt-dial' },
        loose.slice(0, 40).map((l) =>
          h(
            'a',
            { class: 'nt-dial-item', href: l.url, title: l.url, onclick: (e: MouseEvent) => (e.preventDefault(), openUrl(ctx, l.url!, e)) },
            favicon(l.url!, l.title),
            h('span', {}, l.title || l.url!),
          ),
        ),
      ),
    );
  }
  const grid = h('div', { class: 'stacks-grid' });
  for (const f of kids.filter((k) => !k.url)) grid.append(stackEl(ctx, f));
  if (grid.childElementCount) sec.append(grid);
  return sec;
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

export async function newtabView(ctx: Ctx): Promise<HTMLElement> {
  const browser = await detectBrowser();
  applyLook(ctx.settings.newtab.look, browser, ctx.settings.newtab.accent);
  document.body.toggleAttribute('data-calm', ctx.settings.newtab.calmImages);
  const root = h('div', { class: 'nt2' });
  const input = h('input', { class: 'nt-input', placeholder: 'Search or type a URL', autocomplete: 'off', spellcheck: 'false', autofocus: true, 'aria-label': 'Search or type a URL' });
  const results = h('div', { class: 'results nt-results', hidden: true });
  const content = h('div', { class: 'nt-content' });

  const field = h('label', { class: 'nt-field' }, h('span', { class: 'nt-field-tag' }, 'srch'), h('span', { class: 'nt-field-icon' }, ico('search', 20)), input, voiceButton(input), h('kbd', { class: 'nt-kbd' }, '/'));
  const hero = h('section', { class: 'nt-hero' }, ctx.settings.newtab.clock ? clockEl(ctx) : h('div', { class: 'nt-clock' }, greetingEl(ctx), weatherEl(ctx)), displayEl(ctx));
  const badges = await getLocal<Record<string, number>>('badges', {});

  // Home | AI: our dashboard, or your browser's AI and every assistant's chats.
  const aiOn = ctx.settings.newtab.aiTab;
  let mode: Mode = aiOn ? getMode() : 'home';
  const home = h('div', { class: 'nt-home' }, await choiceCard(ctx, browser), hero, h('div', { class: 'nt-console' }, field, results, appKeys(ctx, badges)), content);
  const aiHost = h('div', { class: 'nt-ai-host' });
  let aiBuilt = false;
  const modeBtns: HTMLButtonElement[] = [];
  const setMode = async (m: Mode) => {
    mode = m;
    saveMode(m);
    root.dataset.mode = m;
    document.documentElement.dataset.mode = m;
    modeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === m)));
    if (m === 'ai' && !aiBuilt) {
      aiBuilt = true;
      aiHost.append(await aiView(ctx, () => void setMode('home')));
    } else if (m === 'ai') aiHost.querySelector<HTMLTextAreaElement>('.ai-input')?.focus();
    else input.focus();
  };
  const modes = aiOn
    ? h(
        'nav',
        { class: 'nt-modes', role: 'tablist', 'aria-label': 'New tab' },
        (['home', 'ai'] as Mode[]).map((m) => {
          const b = h('button', { type: 'button', role: 'tab', class: 'nt-mode', dataset: { m }, 'aria-selected': String(m === mode), onclick: () => void setMode(m) }, h('b', { class: 'ai-led' }), m === 'home' ? 'Home' : 'AI');
          modeBtns.push(b);
          return b;
        }),
        h('span', { class: 'nt-modes-hint' }, h('kbd', {}, '⇥'), ' to switch'),
      )
    : null;
  const wall = await wallpaperEl(ctx);
  if (wall) root.dataset.wall = ctx.settings.newtab.wallpaper;
  if (wall) root.append(wall);
  root.append(
    h('div', { class: 'nt-frame', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
    h('div', { class: 'nt-grain', 'aria-hidden': 'true' }),
    h('div', { class: 'nt-page' }, topBar(ctx), modes, home, aiHost),
  );
  root.dataset.mode = mode;
  document.documentElement.dataset.mode = mode;

  const ui = await createSearch(ctx, input, results, () => {
    input.value = '';
    results.hidden = true;
    content.hidden = false;
  });
  void ui;
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
      if (e.key === 'Enter' && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v) && !/\s/.test(v)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        location.href = /^https?:\/\//.test(v) ? v : `https://${v}`;
      }
    },
    true,
  );

  const todo = await todoSection(ctx);
  if (todo) content.append(todo);
  if (ctx.settings.edition.enabled) content.append(await editionSection(ctx));
  const sh = await shelf(ctx);
  if (sh) content.append(sh);
  content.append(
    h(
      'footer',
      { class: 'nt-foot' },
      h('span', {}, h('kbd', {}, '/'), ' search   ', h('kbd', {}, '1–9'), ' apps   ', h('kbd', {}, keys('K')), ' anywhere'),
      h('span', { class: 'nt-ascii' }, '~:*-/  =+|<  /\\-_'),
      h('span', {}, 'sidegig · free and open source'),
    ),
  );

  // Keys: "/" to search, 1–9 to open apps (when you're not typing).
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) return removeEventListener('keydown', onKey);
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    if (e.key === '/') {
      e.preventDefault();
      if (mode === 'ai') aiHost.querySelector<HTMLTextAreaElement>('.ai-input')?.focus();
      else input.focus();
    } else if (/^[1-9]$/.test(e.key) && mode === 'home') {
      const app = ctx.settings.apps[Number(e.key) - 1];
      if (app) {
        e.preventDefault();
        root.querySelectorAll<HTMLElement>('.nt-key')[Number(e.key) - 1]?.classList.add('pressed');
        launch(ctx, app, e);
      }
    }
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', () => root.querySelectorAll('.nt-key.pressed').forEach((k) => k.classList.remove('pressed')));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyLook(ctx.settings.newtab.look, browser, ctx.settings.newtab.accent));
  if (mode === 'ai') void setMode('ai');
  else requestAnimationFrame(() => input.focus());
  return root;
}
