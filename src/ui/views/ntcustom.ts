// Customize panel for the new tab: themes and backgrounds, with live preview.
// Slides in from the right, like Chrome's own Customize panel.
import { getLocal, setLocal, updateSettings } from '../../shared/storage.ts';
import { PACKS, collectionFromKeywords, parseWallhaven, parseNasa, parseBing, wallhavenUrl, nasaUrl, bingUrl, type Collection } from '../../shared/walls.ts';
import { readPool, refreshPool } from '../../shared/collect.ts';
import type { NtBackground, NtLook, Settings } from '../../shared/types.ts';
import { h, ico, toast } from '../dom.ts';
import type { Ctx } from '../ctx.ts';
import { seg } from './quick.ts';
import { play } from '../sound.ts';
import { GRADIENTS, PATTERNS, LANDSCAPES, MONUMENTS, landscapeUrl, monumentUrl, listUploads, addUpload, removeUpload, prepareImage } from './ntwall.ts';

export const THEMES: { id: NtLook; name: string; note: string; swatch: [string, string, string]; studio: boolean }[] = [
  { id: 'auto', name: 'Match browser', note: 'follows your browser', swatch: ['#ffffff', '#1f1f1f', '#0b57d0'], studio: false },
  { id: 'paper', name: 'Paper', note: 'warm grey, signal orange', swatch: ['#efefea', '#121212', '#ff4f00'], studio: true },
  { id: 'night', name: 'Night', note: 'black, warm white', swatch: ['#0f0f0e', '#ecece6', '#ff5a1f'], studio: true },
  { id: 'ultramarine', name: 'Ultramarine', note: 'electric blue', swatch: ['#0a12e6', '#f2f2ee', '#ff6a2b'], studio: true },
  { id: 'indigo', name: 'Indigo', note: 'risograph print', swatch: ['#eceae3', '#1f2470', '#ff4f00'], studio: true },
  { id: 'cobalt', name: 'Cobalt', note: 'indigo night', swatch: ['#13174a', '#ecebe4', '#ff6a2b'], studio: true },
  { id: 'field', name: 'Field', note: 'all orange', swatch: ['#ff5a1f', '#111111', '#111111'], studio: true },
  { id: 'phosphor', name: 'Phosphor', note: 'control room', swatch: ['#0d1a13', '#b8f5c8', '#7dff9b'], studio: true },
  { id: 'sand', name: 'Sand', note: 'warm and airy', swatch: ['#efe6d8', '#2b2118', '#c2410c'], studio: true },
  { id: 'mono', name: 'Mono', note: 'black and white', swatch: ['#ffffff', '#000000', '#d71921'], studio: true },
  { id: 'picture', name: 'From picture', note: 'colours from your wallpaper', swatch: ['#16181d', '#f2f0ea', '#ff6a2b'], studio: true },
  { id: 'custom', name: 'Custom', note: 'your colours', swatch: ['#f1ede4', '#1d1b16', '#ff4f00'], studio: true },
];

/** The palette last read from the wallpaper (for the From picture card). */
function pictureSwatch(): [string, string, string] | null {
  try {
    const p = JSON.parse(localStorage.getItem('sidegig.ntPicture') || 'null');
    return p?.bg ? [p.bg, p.ink, p.accent] : null;
  } catch {
    return null;
  }
}

/** A preview for a pack: its pool's best picture, or one quick search. Cached. */
async function packThumb(c: Collection): Promise<string> {
  const pool = await readPool(c.id);
  if (pool?.items[0]) return pool.items[0].thumb;
  const cache = await getLocal<Record<string, string>>('ntPackThumbs', {});
  if (cache[c.id]) return cache[c.id];
  const src = c.sources?.[0] ?? 'wallhaven';
  // Try the terms in turn until one has a picture worth showing.
  for (const term of src === 'bing' ? [''] : c.terms.slice(0, 3)) {
    try {
      const url = src === 'nasa' ? nasaUrl(term) : src === 'bing' ? bingUrl(0) : wallhavenUrl(term, c, 1);
      const json = await (await fetch(url, { credentials: 'omit' })).json();
      const items = src === 'nasa' ? parseNasa(json, term) : src === 'bing' ? parseBing(json) : parseWallhaven(json, term);
      const best = [...items].sort((a, b) => b.score - a.score)[0];
      if (!best) continue;
      cache[c.id] = best.thumb;
      await setLocal('ntPackThumbs', cache);
      return best.thumb;
    } catch {
      /* next term */
    }
  }
  return '';
}

const SESSION = 'sidegig.cz';
let escListener: AbortController | undefined;
/** Survives the page re-rendering after each change (and works where storage is blocked). */
let openTab = '';
let scrollMemo: Record<string, number> = {};
const remember = (v: string) => {
  openTab = v;
  try {
    if (v) sessionStorage.setItem(SESSION, v);
    else sessionStorage.removeItem(SESSION);
  } catch {
    /* fine */
  }
};
const recalled = () => {
  if (openTab) return openTab;
  try {
    return sessionStorage.getItem(SESSION) ?? '';
  } catch {
    return '';
  }
};

const set = (fn: (s: Settings) => void) => void updateSettings(fn);
const setBg = (patch: Partial<NtBackground>) => set((s) => void (s.newtab.background = { ...s.newtab.background, ...patch }));

function themeCard(ctx: Ctx, t: (typeof THEMES)[number]): HTMLElement {
  const [bg, ink, accent] = t.id === 'custom' ? [ctx.settings.newtab.custom.bg, ctx.settings.newtab.custom.ink, ctx.settings.newtab.custom.accent] : t.id === 'picture' ? pictureSwatch() ?? t.swatch : t.swatch;
  const on = ctx.settings.newtab.look === t.id;
  return h(
    'button',
    {
      type: 'button',
      class: 'cz-theme',
      'aria-pressed': String(on),
      onclick: () => {
        play('key');
        set((s) => void (s.newtab.look = t.id));
      },
    },
    h(
      'span',
      { class: 'cz-prev', dataset: { studio: String(t.studio) }, style: { background: bg, color: ink } },
      h('span', { class: 'cz-time' }, '11:08'),
      h('span', { class: 'cz-bar', style: { background: accent } }),
      h('span', { class: 'cz-keys' }, h('i', { style: { borderColor: ink } }), h('i', { style: { borderColor: ink } }), h('i', { style: { background: accent, borderColor: accent } })),
    ),
    h('span', { class: 'cz-name' }, t.name),
    h('span', { class: 'cz-note' }, t.note),
  );
}

function customEditor(ctx: Ctx): HTMLElement {
  const c = ctx.settings.newtab.custom;
  const field = (label: string, key: 'bg' | 'ink' | 'accent', cssVar: string) => {
    const input = h('input', { type: 'color', value: c[key], 'aria-label': label });
    input.addEventListener('input', () => document.documentElement.style.setProperty(cssVar, input.value));
    input.addEventListener('change', () =>
      set((s) => {
        s.newtab.custom = { ...s.newtab.custom, [key]: input.value };
        s.newtab.look = 'custom';
      }),
    );
    return h('label', { class: 'cz-color' }, input, h('span', {}, label));
  };
  return h('div', { class: 'cz-custom' }, field('Page', 'bg', '--c-bg'), field('Ink', 'ink', '--c-ink'), field('Accent', 'accent', '--c-signal'));
}

function tile(label: string, on: boolean, onClick: () => void, visual: Node | null, extra?: Node | null): HTMLElement {
  return h(
    'div',
    { class: 'cz-tile-wrap' },
    h(
      'button',
      {
        type: 'button',
        class: 'cz-tile',
        'aria-pressed': String(on),
        title: label,
        onclick: () => {
          play('key');
          onClick();
        },
      },
      visual,
      h('span', { class: 'cz-tile-label' }, label),
    ),
    extra ?? null,
  );
}

const thumb = (src: string) => h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });

const FX: [NtBackground['treatment'], string, string][] = [
  ['auto', 'Auto', 'Right for the theme'],
  ['photo', 'Photo', 'As it is'],
  ['film', 'Film', 'Grain, warm shadows, vignette'],
  ['dream', 'Dream', 'Soft focus and a fine dot grid'],
  ['led', 'LED', 'A glowing dot-matrix wall'],
  ['mosaic', 'Mosaic', 'Big pixel tiles'],
  ['print', 'Print', 'Two-tone risograph in the theme’s inks'],
];

function fxPicker(current: NtBackground['treatment']): HTMLElement {
  return h(
    'div',
    { class: 'cz-fx', role: 'radiogroup', 'aria-label': 'Effect' },
    FX.map(([id, label, note]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'cz-fx-b',
          dataset: { fx: id },
          title: note,
          'aria-checked': String(current === id),
          onclick: () => {
            play('key');
            setBg({ treatment: id });
          },
        },
        h('i', { class: 'cz-fx-sw' }),
        label,
      ),
    ),
  );
}

/** Theme packs, your keyword collections, and a box to make a new one. */
async function collectionsSection(ctx: Ctx, bg: NtBackground, is: (k: NtBackground['kind'], ref?: string) => boolean): Promise<HTMLElement> {
  const mine = ctx.settings.newtab.collections;
  const pick = (c: Collection) => {
    setBg({ kind: 'collection', ref: c.id });
    // Warm the pool now so the first picture shows quickly.
    void refreshPool(c).catch(() => toast('Couldn’t reach the wallpaper sources. Will try again.'));
  };
  const packTile = (c: Collection, removable: boolean) => {
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    void packThumb(c).then((src) => (src ? (img.src = src) : img.remove()));
    return tile(
      c.name,
      is('collection', c.id),
      () => pick(c),
      h('span', { class: 'cz-pack' }, img, h('b', { class: 'cz-pack-name' }, c.name)),
      removable
        ? h(
            'button',
            {
              type: 'button',
              class: 'cz-remove',
              'aria-label': `Remove ${c.name}`,
              onclick: () =>
                set((s) => {
                  s.newtab.collections = s.newtab.collections.filter((x) => x.id !== c.id);
                  if (s.newtab.background.kind === 'collection' && s.newtab.background.ref === c.id) s.newtab.background = { ...s.newtab.background, kind: 'none', ref: '' };
                }),
            },
            '×',
          )
        : null,
    );
  };
  const input = h('input', { class: 'text-input', type: 'text', placeholder: 'Porsche 911, Naruto, Tokyo rain…', 'aria-label': 'Keywords', maxlength: 160 });
  const form = h(
    'form',
    {
      class: 'cz-link cz-make',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const c = collectionFromKeywords(input.value);
        if (!c) return toast('Type a word or two, like “porsche 911” or “naruto”');
        set((s) => {
          s.newtab.collections = [c, ...s.newtab.collections.filter((x) => x.id !== c.id)].slice(0, 12);
          s.newtab.background = { ...s.newtab.background, kind: 'collection', ref: c.id };
        });
        play('confirm');
        void refreshPool(c).catch(() => toast('Nothing found for that yet. Try other words.'));
      },
    },
    input,
    h('button', { class: 'btn', type: 'submit' }, 'Collect'),
  );
  const current = bg.kind === 'collection' ? [...PACKS, ...mine].find((c) => c.id === bg.ref) : null;
  return h(
    'section',
    { class: 'cz-sec cz-cols' },
    h('div', { class: 'cz-sec-h' }, 'Collections'),
    h('p', { class: 'cz-hint cz-hint-top' }, 'Pick what you’re into. sidegig collects the wallpapers people loved most, keeps the ones that look great behind a new tab, and refreshes them on its own.'),
    form,
    mine.length ? h('div', { class: 'cz-grid cz-grid-packs' }, mine.map((c) => packTile(c as Collection, true))) : null,
    h('div', { class: 'cz-grid cz-grid-packs' }, PACKS.map((c) => packTile(c, false))),
    current
      ? h(
          'p',
          { class: 'cz-hint' },
          `${current.name}: ${current.terms.join(', ')}. `,
          h(
            'button',
            {
              type: 'button',
              class: 'linkish',
              onclick: () => {
                toast('Looking for new wallpapers…');
                void refreshPool(current).then(() => ctx.go('home'), () => toast('Couldn’t reach the wallpaper sources'));
              },
            },
            'Refresh now',
          ),
        )
      : null,
  );
}

async function backgroundTab(ctx: Ctx): Promise<HTMLElement> {
  const bg = ctx.settings.newtab.background;
  const is = (kind: NtBackground['kind'], ref?: string) => bg.kind === kind && (ref === undefined || bg.ref === ref);
  const wrap = h('div', { class: 'cz-bg' });

  // Controls first: they apply to whatever you pick.
  const live = (prop: string, value: string) => document.querySelector<HTMLElement>('.nt-wall')?.style.setProperty(prop, value);
  const dim = h('input', { type: 'range', min: 0, max: 90, value: bg.dim, 'aria-label': 'Veil' });
  dim.addEventListener('input', () => live('--wall-dim', String(Number(dim.value) / 100)));
  dim.addEventListener('change', () => setBg({ dim: Number(dim.value) }));
  const blur = h('input', { type: 'range', min: 0, max: 24, value: bg.blur, 'aria-label': 'Blur' });
  blur.addEventListener('input', () => live('--wall-blur', `${blur.value}px`));
  blur.addEventListener('change', () => setBg({ blur: Number(blur.value) }));
  wrap.append(
    h(
      'div',
      { class: 'cz-controls' },
      h('div', { class: 'cz-row cz-row-top' }, h('span', {}, 'Effect'), fxPicker(bg.treatment)),
      bg.kind === 'collection'
        ? h('div', { class: 'cz-row' }, h('span', {}, 'New picture'), seg(bg.rotate ?? 'tab', [['tab', 'Every tab'], ['hour', 'Hourly'], ['day', 'Daily']], (v) => setBg({ rotate: v })))
        : null,
      h('div', { class: 'cz-row' }, h('span', {}, 'Veil'), dim),
      h('div', { class: 'cz-row' }, h('span', {}, 'Blur'), blur),
      h('p', { class: 'cz-hint' }, 'Auto keeps photos in Match browser and gives studio themes film grain or a risograph print. Drop any image on the new tab to use it.'),
    ),
  );

  wrap.append(await collectionsSection(ctx, bg, is));

  const section = (title: string, ...kids: Node[]) => h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, title), h('div', { class: 'cz-grid' }, ...kids));
  const day = Math.floor(Date.now() / 86_400_000);

  // Yours: uploads, a link, a colour.
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  file.addEventListener('change', async () => {
    const files = [...(file.files ?? [])];
    let last = '';
    for (const f of files) {
      try {
        last = (await addUpload(await prepareImage(f))).id;
      } catch {
        toast('Couldn’t use that picture');
      }
    }
    if (last) setBg({ kind: 'upload', ref: last });
  });
  const ups = await listUploads();
  const linkIn = h('input', { class: 'text-input', type: 'url', placeholder: 'Paste an image link', value: bg.kind === 'url' ? bg.ref : '' });
  const color = h('input', { type: 'color', value: bg.kind === 'color' ? bg.ref : '#1d1b16', 'aria-label': 'Solid colour' });
  color.addEventListener('change', () => setBg({ kind: 'color', ref: color.value }));
  wrap.append(
    section(
      'Yours',
      tile('Upload', false, () => file.click(), h('span', { class: 'cz-plus' }, ico('plus', 22))),
      ...ups.map((u) =>
        tile(
          'Your picture',
          is('upload', u.id),
          () => setBg({ kind: 'upload', ref: u.id }),
          thumb(u.url),
          h(
            'button',
            {
              type: 'button',
              class: 'cz-remove',
              'aria-label': 'Remove this picture',
              onclick: async () => {
                await removeUpload(u.id);
                if (is('upload', u.id)) setBg({ kind: 'none', ref: '' });
                else set(() => undefined);
              },
            },
            '×',
          ),
        ),
      ),
      tile('Colour', is('color'), () => color.click(), h('span', { class: 'cz-swatch', style: { background: color.value } }, color)),
      tile('None', is('none'), () => setBg({ kind: 'none', ref: '' }), h('span', { class: 'cz-none' })),
    ),
    h(
      'form',
      {
        class: 'cz-link',
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (/^https?:\/\//.test(linkIn.value.trim())) setBg({ kind: 'url', ref: linkIn.value.trim() });
          else toast('Paste a link that starts with https://');
        },
      },
      linkIn,
      h('button', { class: 'btn', type: 'submit' }, 'Use'),
    ),
    file,
    section(
      'Every day',
      tile('Daily landscape', is('daily'), () => setBg({ kind: 'daily', ref: '' }), thumb(landscapeUrl(LANDSCAPES[day % LANDSCAPES.length], 320, 200))),
      tile('Monuments', is('monuments'), () => setBg({ kind: 'monuments', ref: '' }), thumb(monumentUrl(day % MONUMENTS.length, 200))),
    ),
    section('Gradients', ...GRADIENTS.map((g) => tile(g.name, is('gradient', g.id), () => setBg({ kind: 'gradient', ref: g.id }), h('span', { class: 'cz-fill', style: { background: g.css } })))),
    section('Patterns', ...PATTERNS.map((p) => tile(p.name, is('pattern', p.id), () => setBg({ kind: 'pattern', ref: p.id }), h('span', { class: `cz-fill wall-${p.id}` })))),
    section('Landscapes', ...LANDSCAPES.map((id) => tile('Landscape', is('photo', `p:${id}`), () => setBg({ kind: 'photo', ref: `p:${id}` }), thumb(landscapeUrl(id, 320, 200))))),
    section('Monuments', ...MONUMENTS.map(([, title], n) => tile(title, is('photo', `m:${n}`), () => setBg({ kind: 'photo', ref: `m:${n}` }), thumb(monumentUrl(n, 200))))),
    h('p', { class: 'cz-hint' }, 'Landscapes come from Lorem Picsum (Unsplash photographers). Monuments are public-domain sculpture from the Art Institute of Chicago. Your pictures stay on this device.'),
  );
  return wrap;
}

function themeTab(ctx: Ctx): HTMLElement {
  const n = ctx.settings.newtab;
  return h(
    'div',
    { class: 'cz-themes-wrap' },
    h('div', { class: 'cz-themes' }, THEMES.map((t) => themeCard(ctx, t))),
    h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, 'Custom theme'), customEditor(ctx)),
    h(
      'section',
      { class: 'cz-sec' },
      h('div', { class: 'cz-sec-h' }, 'Accent'),
      h(
        'div',
        { class: 'swatches' },
        h('button', { type: 'button', class: 'swatch', title: 'The theme’s own', 'aria-pressed': String(!n.accent), style: { background: 'conic-gradient(#ff4f00, #2c5bff, #12a150, #ff4f00)' }, onclick: () => set((s) => void (s.newtab.accent = '')) }),
        ['#ff4f00', '#0b57d0', '#6e56ff', '#e0407f', '#12a150', '#e7a800', '#121212'].map((c) =>
          h('button', { type: 'button', class: 'swatch', title: c, 'aria-pressed': String(n.accent === c), style: { background: c }, onclick: () => set((s) => void (s.newtab.accent = c)) }),
        ),
      ),
    ),
  );
}

/** The panel, plus the button that opens it. Stays open across the page re-rendering after each change. */
export function customize(ctx: Ctx): { button: HTMLElement; panel: HTMLElement } {
  const body = h('div', { class: 'cz-body' });
  const tabs = h('div', { class: 'cz-tabs', role: 'tablist' });
  const panel = h('aside', { class: 'nt-cz', role: 'dialog', 'aria-label': 'Customize', hidden: true }, h('header', { class: 'cz-head' }, h('b', {}, 'Customize'), tabs, h('button', { type: 'button', class: 'nt-gear', 'aria-label': 'Close', onclick: () => close() }, ico('close', 18))), body);
  let tab = recalled() || 'theme';
  const show = async (t: string) => {
    tab = t;
    remember(t);
    tabs.replaceChildren(
      ...([['theme', 'Theme'], ['background', 'Background']] as const).map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === t), onclick: () => void show(id) }, label),
      ),
    );
    let scroll = scrollMemo[t] ?? 0;
    try {
      scroll = scrollMemo[t] ?? Number(sessionStorage.getItem(`${SESSION}.scroll.${t}`) ?? 0);
    } catch {
      /* storage blocked: memory only */
    }
    body.replaceChildren(t === 'theme' ? themeTab(ctx) : await backgroundTab(ctx));
    body.scrollTop = scroll;
  };
  body.addEventListener('scroll', () => {
    scrollMemo = { ...scrollMemo, [tab]: body.scrollTop };
    try {
      sessionStorage.setItem(`${SESSION}.scroll.${tab}`, String(body.scrollTop));
    } catch {
      /* fine */
    }
  });
  const open = () => {
    panel.hidden = false;
    document.documentElement.dataset.cz = '1';
    void show(tab);
  };
  const close = () => {
    panel.hidden = true;
    delete document.documentElement.dataset.cz;
    remember('');
  };
  escListener?.abort();
  escListener = new AbortController();
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && close(), { signal: escListener.signal });
  const [bg, ink, accent] = ctx.settings.newtab.look === 'custom' ? [ctx.settings.newtab.custom.bg, ctx.settings.newtab.custom.ink, ctx.settings.newtab.custom.accent] : (THEMES.find((t) => t.id === ctx.settings.newtab.look) ?? THEMES[0]).swatch;
  const button = h(
    'button',
    { type: 'button', class: 'nt-cz-btn', title: 'Customize: theme and background', 'aria-haspopup': 'dialog', onclick: () => (panel.hidden ? open() : close()) },
    h('span', { class: 'cz-dot', style: { background: `linear-gradient(135deg, ${bg} 50%, ${ink} 50%)`, boxShadow: `0 0 0 2px ${accent}` } }),
    h('span', {}, 'Customize'),
  );
  if (recalled()) queueMicrotask(open);
  return { button, panel };
}
