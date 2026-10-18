// Customize panel for the new tab: themes and backgrounds, with live preview.
// Slides in from the right, like Chrome's own Customize panel.
import { getLocal, setLocal, updateSettings } from '../../shared/storage.ts';
import { PACKS, collectionFromKeywords, parseWallhaven, parseNasa, parseBing, wallhavenUrl, nasaUrl, bingUrl, type Collection } from '../../shared/walls.ts';
import { readPool, refreshPool, listAlbums, albumImage, saveAlbum, removeAlbum } from '../../shared/collect.ts';
import type { NtBackground, NtLook, Settings } from '../../shared/types.ts';
import { h, ico, toast } from '../dom.ts';
import type { Ctx } from '../ctx.ts';
import { seg } from './quick.ts';
import { findPlace } from './ntwidgets.ts';
import { CAL_APPS, type CalApp } from '../../shared/ntcal.ts';
import { icon } from '../../shared/icons.ts';
import { figureSvg } from '../figures/iso.ts';
import { TIMER } from '../figures/timer.ts';
import { WATCH } from '../figures/watch.ts';
import { STATION } from '../figures/station.ts';
import { CUBES } from '../figures/cubes.ts';
import { SPIKE } from '../figures/spike.ts';
import { PAD } from '../figures/pad.ts';
import { play } from '../sound.ts';
import { SCALE_MAX, SCALE_MIN, applyScale, clampScale } from '../../shared/scale.ts';
import { GRADIENTS, PATTERNS, LANDSCAPES, MONUMENTS, RISO, effectFor, landscapeUrl, monumentUrl, listUploads, addUpload, removeUpload, prepareImage } from './ntwall.ts';

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
  if (c.album || c.id.startsWith('album:')) {
    const a = (await listAlbums()).find((x) => x.id === c.id);
    return a?.items[0] ? albumImage(a.items[0].id) : '';
  }
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

/** Survives settings redraws, but a fresh page always starts closed. */
let openTab = '';
let scrollMemo: Record<string, number> = {};
const remember = (v: string) => {
  openTab = v;
};
const recalled = () => openTab;

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
        try {
          localStorage.setItem('sidegig.lastPalette', t.id);
        } catch {
          /* fine */
        }
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
  ['photo', 'Photo', 'As it is'],
  ['film', 'Film', 'Grain, warm shadows, vignette'],
  ['dream', 'Dream', 'Soft focus and a fine dot grid'],
  ['led', 'LED', 'A glowing dot-matrix wall'],
  ['mosaic', 'Mosaic', 'Big pixel tiles'],
  ['print', 'Print', 'Risograph in the theme’s inks or a named set'],
  ['ascii', 'ASCII', 'The picture drawn in letters'],
];

/** Print inks: the theme's two, or a named set (Indigo, Lavender, Nova, Cobalt). */
function inkPicker(current: NtBackground['inks']): HTMLElement {
  const opts: [NtBackground['inks'], string, string[]][] = [['theme', 'Theme', ['var(--c-ink)', 'var(--c-bg)']], ...Object.entries(RISO).map(([id, r]) => [id as NtBackground['inks'], r.name, r.inks] as [NtBackground['inks'], string, string[]])];
  return h(
    'div',
    { class: 'cz-inks', role: 'radiogroup', 'aria-label': 'Inks' },
    opts.map(([id, name, cols]) =>
      h(
        'button',
        { type: 'button', role: 'radio', class: 'cz-ink', 'aria-checked': String(current === id), onclick: () => (play('key'), setBg({ inks: id, treatment: 'print' })) },
        h('span', { class: 'cz-ink-sw', 'aria-hidden': 'true' }, cols.map((c) => h('i', { style: { background: c } }))),
        name,
      ),
    ),
  );
}

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
          'aria-checked': String((current === 'auto' ? 'photo' : current) === id),
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
              onclick: async () => {
                if (c.album && !confirm(`Remove “${c.name}” and its pictures from this device?`)) return;
                if (c.album) await removeAlbum(c.id);
                set((s) => {
                  s.newtab.collections = s.newtab.collections.filter((x) => x.id !== c.id);
                  if (s.newtab.background.kind === 'collection' && s.newtab.background.ref === c.id) s.newtab.background = { ...s.newtab.background, kind: 'none', ref: '' };
                });
              },
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
  // A collection from your own pictures: pick several (or a whole folder), name it.
  const pics = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const folder = h('input', { type: 'file', multiple: true, hidden: true });
  folder.setAttribute('webkitdirectory', '');
  const albumName = h('input', { class: 'text-input', type: 'text', placeholder: 'Name it, like NS', maxlength: 40, 'aria-label': 'Collection name' });
  const albumForm = h('div', { class: 'cz-album', hidden: true });
  let chosen: File[] = [];
  const makeAlbum = async () => {
    const files = chosen.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(f.name));
    if (!files.length) return toast('Those weren’t pictures');
    toast(`Adding ${files.length} picture${files.length === 1 ? '' : 's'}…`);
    const images: { url: string; w: number; h: number; name?: string }[] = [];
    for (const f of files.slice(0, 60)) {
      try {
        const url = await prepareImage(f);
        const bmp = await createImageBitmap(await (await fetch(url)).blob());
        images.push({ url, w: bmp.width, h: bmp.height, name: f.name });
      } catch {
        /* skip what can't be read */
      }
    }
    if (!images.length) return toast('Couldn’t read those pictures');
    const a = await saveAlbum(albumName.value || 'My pictures', images);
    play('confirm');
    set((s) => {
      s.newtab.collections = [{ id: a.id, name: a.name, terms: [], album: true }, ...s.newtab.collections.filter((x) => x.id !== a.id)];
      s.newtab.background = { ...s.newtab.background, kind: 'collection', ref: a.id };
    });
  };
  const onPick = (input: HTMLInputElement) => {
    chosen = [...(input.files ?? [])];
    input.value = '';
    if (!chosen.length) return;
    const dir = (chosen[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0];
    if (dir && !albumName.value) albumName.value = dir;
    albumForm.hidden = false;
    albumName.focus();
    albumForm.querySelector('.cz-album-count')!.textContent = `${chosen.length} picture${chosen.length === 1 ? '' : 's'} chosen`;
  };
  pics.addEventListener('change', () => onPick(pics));
  folder.addEventListener('change', () => onPick(folder));
  albumForm.append(
    h('span', { class: 'cz-album-count' }),
    h('div', { class: 'cz-link' }, albumName, h('button', { class: 'btn', type: 'button', onclick: makeAlbum }, 'Create')),
  );
  const yours = h(
    'div',
    { class: 'cz-yours' },
    h('div', { class: 'cz-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => pics.click() }, 'From your pictures'), h('button', { class: 'btn', type: 'button', onclick: () => folder.click() }, 'From a folder')),
    albumForm,
    pics,
    folder,
  );
  const current = bg.kind === 'collection' ? [...PACKS, ...mine].find((c) => c.id === bg.ref) : null;
  return h(
    'section',
    { class: 'cz-sec cz-cols' },
    h('div', { class: 'cz-sec-h' }, 'Collections'),
    h('p', { class: 'cz-hint cz-hint-top' }, 'Pick what you’re into. sidegig collects the wallpapers people loved most, keeps the ones that look great behind a new tab, and refreshes them on its own.'),
    form,
    yours,
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
  const dimValue = h('output', { class: 'cz-val' }, `${bg.dim}%`);
  const blurValue = h('output', { class: 'cz-val' }, `${bg.blur} px`);
  const dim = h('input', { type: 'range', min: 0, max: 90, value: bg.dim, 'aria-label': 'Fade' });
  dim.addEventListener('input', () => { live('--wall-dim', String(Number(dim.value) / 100)); dimValue.textContent = `${dim.value}%`; });
  dim.addEventListener('change', () => setBg({ dim: Number(dim.value) }));
  const blur = h('input', { type: 'range', min: 0, max: 24, value: bg.blur, 'aria-label': 'Soften' });
  blur.addEventListener('input', () => { live('--wall-blur', `${blur.value}px`); blurValue.textContent = `${blur.value} px`; });
  blur.addEventListener('change', () => setBg({ blur: Number(blur.value) }));
  wrap.append(
    h('p', { class: 'cz-lede' }, 'The picture behind everything, and how it’s drawn. Changing it never changes your colours.'),
    h(
      'div',
      { class: 'cz-controls' },
      h('div', { class: 'cz-row cz-row-top' }, h('span', {}, 'Effect'), h('div', {}, fxPicker(bg.treatment), effectFor(bg) === 'print' ? inkPicker(bg.inks) : null)),
      bg.kind === 'collection'
        ? h('div', { class: 'cz-row' }, h('span', {}, 'New picture'), seg(bg.rotate ?? 'tab', [['tab', 'Every tab'], ['hour', 'Hourly'], ['day', 'Daily']], (v) => setBg({ rotate: v })))
        : null,
      h('div', { class: 'cz-row' }, h('span', {}, 'Fade'), dim, dimValue),
      h('div', { class: 'cz-row' }, h('span', {}, 'Soften'), blur, blurValue),
      h('button', { type: 'button', class: 'btn', onclick: () => setBg({ dim: 0, blur: 0, treatment: 'photo' }) }, 'Reset picture effects'),
      h('p', { class: 'cz-hint' }, 'Fade washes the picture toward your page colour; Soften blurs it. Drop any image on the new tab to use it.'),
    ),
  );

  wrap.append(surfaceControl(ctx), await collectionsSection(ctx, bg, is));

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

/** The page's own name and tag, in place of "sidegig". */
function nameSection(ctx: Ctx): HTMLElement {
  const n = ctx.settings.newtab;
  const title = h('input', { class: 'text-input', type: 'text', value: n.title, placeholder: 'sidegig', maxlength: 32, 'aria-label': 'Name on the page' });
  const tag = h('input', { class: 'text-input cz-tag-in', type: 'text', value: n.tag, placeholder: 'Tag', maxlength: 16, 'aria-label': 'Tag next to the name' });
  const save = () => {
    const t = title.value.replace(/\s+/g, ' ').trim();
    const g = tag.value.trim();
    if (t === n.title && g === n.tag) return;
    play('confirm');
    set((s) => {
      s.newtab.title = t === 'sidegig' ? '' : t;
      s.newtab.tag = g;
    });
  };
  // Live preview in the corner while you type.
  title.addEventListener('input', () => {
    const w = document.querySelector<HTMLElement>('.nt-brand .nt-word');
    if (w) w.textContent = title.value.trim() || 'sidegig';
  });
  for (const el of [title, tag]) {
    el.addEventListener('change', save);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), save()));
  }
  return h(
    'section',
    { class: 'cz-sec' },
    h('div', { class: 'cz-sec-h' }, 'Name on the page'),
    h('div', { class: 'cz-name-row' }, title, tag),
    h('p', { class: 'cz-hint' }, 'Shown in the top corner and the footer. Leave it empty for sidegig, clear the tag to hide it.'),
  );
}

/** The last palette you picked, so switching back to Palette lands on it. */
const lastPalette = (): NtLook => {
  try {
    const v = localStorage.getItem('sidegig.lastPalette') as NtLook | null;
    return v && THEMES.some((t) => t.id === v && t.id !== 'auto' && t.id !== 'picture') ? v : 'paper';
  } catch {
    return 'paper';
  }
};

/** Colours: where the page's colours come from (the wallpaper, your browser, or a palette), the accent and icons. */
function coloursTab(ctx: Ctx): HTMLElement {
  const n = ctx.settings.newtab;
  const source: 'picture' | 'browser' | 'palette' = n.look === 'picture' ? 'picture' : n.look === 'auto' ? 'browser' : 'palette';
  const hasPicture = !['none', 'gradient', 'pattern', 'color'].includes(n.background.kind);
  const note = {
    picture: hasPicture ? 'Page, widget and accent colours are read from your wallpaper and change with it.' : 'Pick a picture in Wallpaper first. Until then this follows your browser.',
    browser: 'Follows your browser’s own look, light or dark.',
    palette: 'A fixed set of colours that stays the same whatever the wallpaper.',
  }[source];
  return h(
    'div',
    { class: 'cz-themes-wrap' },
    h('p', { class: 'cz-lede' }, 'Colours for the page and its widgets. They never change your wallpaper.'),
    h(
      'section',
      { class: 'cz-sec' },
      h('div', { class: 'cz-sec-h' }, 'Colours from'),
      seg(source, [['picture', 'Wallpaper'], ['browser', 'Browser'], ['palette', 'Palette']], (v) => {
        play('key');
        set((s) => void (s.newtab.look = v === 'picture' ? 'picture' : v === 'browser' ? 'auto' : lastPalette()));
      }),
      h('p', { class: 'cz-hint' }, note),
    ),
    source === 'palette'
      ? h(
          'section',
          { class: 'cz-sec' },
          h('div', { class: 'cz-sec-h' }, 'Palette'),
          h('div', { class: 'cz-themes' }, THEMES.filter((t) => t.id !== 'auto' && t.id !== 'picture').map((t) => themeCard(ctx, t))),
          n.look === 'custom' ? customEditor(ctx) : null,
        )
      : null,
    h(
      'section',
      { class: 'cz-sec' },
      h('div', { class: 'cz-sec-h' }, 'Site icons'),
      seg(ctx.settings.theme.icons, [['original', 'Original'], ['themed', 'Themed']], (v) => set((s) => void (s.theme.icons = v))),
      h('p', { class: 'cz-hint' }, 'Original keeps each site’s own icon, sized to match. Themed draws known logos in your theme’s ink, here and in the sidebar.'),
    ),
    h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, 'Interface size'), sizeSlider(ctx)),
    h(
      'section',
      { class: 'cz-sec' },
      h('div', { class: 'cz-sec-h' }, 'Accent'),
      h(
        'div',
        { class: 'swatches' },
        h('button', { type: 'button', class: 'swatch', title: 'From your colours', 'aria-pressed': String(!n.accent), style: { background: 'conic-gradient(#ff4f00, #2c5bff, #12a150, #ff4f00)' }, onclick: () => set((s) => void (s.newtab.accent = '')) }),
        ['#ff4f00', '#0b57d0', '#6e56ff', '#e0407f', '#12a150', '#e7a800', '#121212'].map((c) =>
          h('button', { type: 'button', class: 'swatch', title: c, 'aria-pressed': String(n.accent === c), style: { background: c }, onclick: () => set((s) => void (s.newtab.accent = c)) }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- widgets

function weatherPlace(ctx: Ctx): HTMLElement {
  const wx = ctx.settings.newtab.weather;
  const input = h('input', { class: 'text-input', type: 'text', value: wx.place, placeholder: 'Your city', 'aria-label': 'Weather city' });
  const picks = h('div', { class: 'cz-picks' });
  const find = async () => {
    const q = input.value.trim();
    if (!q) return;
    const places = await findPlace(q).catch(() => []);
    picks.replaceChildren(
      ...(places.length
        ? places.slice(0, 5).map((p) => h('button', { type: 'button', class: 'nt-chip', onclick: () => (play('confirm'), set((s) => void (s.newtab.weather = { ...s.newtab.weather, enabled: true, place: p.name, lat: p.lat, lon: p.lon }))) }, p.name))
        : [h('span', { class: 'cz-hint' }, 'No place by that name')]),
    );
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), void find()));
  return h(
    'div',
    { class: 'cz-stack' },
    h('div', { class: 'cz-name-row' }, input, h('button', { type: 'button', class: 'btn', onclick: () => void find() }, 'Find'), seg(wx.units, [['f', '°F'], ['c', '°C']], (u) => set((s) => void (s.newtab.weather.units = u)))),
    picks,
  );
}

function calendarSettings(ctx: Ctx): HTMLElement {
  const cal = ctx.settings.newtab.calendar;
  const apps = Object.entries(CAL_APPS) as [CalApp, (typeof CAL_APPS)[CalApp]][];
  const feeds = h(
    'div',
    { class: 'cz-feeds' },
    cal.feeds.map((f, i) =>
      h(
        'div',
        { class: 'cz-feed' },
        h('i', { class: 'cz-feed-dot', style: { background: `var(--feed-${i % 4})` } }),
        h('span', { title: f }, f.replace(/^\w+:\/\//, '').replace(/^([^/]+).*$/, '$1')),
        h('button', { type: 'button', class: 'nt-gear', 'aria-label': 'Remove this calendar', title: 'Remove', onclick: () => set((s) => void (s.newtab.calendar.feeds = s.newtab.calendar.feeds.filter((_, j) => j !== i))) }, ico('close', 16)),
      ),
    ),
  );
  const add = h('input', { class: 'text-input', type: 'url', placeholder: 'https://… or webcal://… (.ics)', 'aria-label': 'Calendar address' });
  const addIt = () => {
    const v = add.value.trim();
    if (!/^(https|webcals?):\/\/\S+$/i.test(v)) return toast('Paste the calendar’s private address (it starts with https:// or webcal://)');
    if (cal.feeds.length >= 6) return toast('Six calendars is the limit here');
    play('confirm');
    set((s) => void (s.newtab.calendar.feeds = [...s.newtab.calendar.feeds, v]));
  };
  add.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), addIt()));
  return h(
    'div',
    { class: 'cz-stack' },
    h('div', { class: 'cz-sub' }, 'Clicks open'),
    h('div', { class: 'cz-chips' }, apps.map(([id, a]) => h('button', { type: 'button', class: 'nt-chip', 'aria-pressed': String(cal.app === id), onclick: () => set((s) => void (s.newtab.calendar.app = id)) }, a.name))),
    h('div', { class: 'cz-sub' }, 'Show events from'),
    feeds,
    h('div', { class: 'cz-name-row' }, add, h('button', { type: 'button', class: 'btn', onclick: addIt }, 'Add')),
    h(
      'p',
      { class: 'cz-hint' },
      'Use the private iCal address. Google: Settings, your calendar, “Secret address in iCal format”. Outlook: Settings, Shared calendars, Publish, ICS. iCloud: share as Public Calendar. Proton: Share, link. Events are read on this device and refreshed every 30 minutes.',
    ),
  );
}

function pomodoroSettings(ctx: Ctx): HTMLElement {
  const p = ctx.settings.newtab.pomodoro;
  const num = (label: string, key: keyof typeof p, min: number, max: number) => {
    const input = h('input', { class: 'text-input cz-num', type: 'number', min, max, value: String(p[key]), 'aria-label': label });
    input.addEventListener('change', () => {
      const v = Math.round(Number(input.value));
      if (!Number.isFinite(v)) return;
      set((s) => void (s.newtab.pomodoro[key] = Math.max(min, Math.min(max, v))));
    });
    return h('label', { class: 'cz-numrow' }, h('span', {}, label), input);
  };
  return h('div', { class: 'cz-nums' }, num('Focus, min', 'focus', 1, 120), num('Short break', 'short', 1, 30), num('Long break', 'long', 1, 60), num('Long break every', 'every', 2, 8));
}

// Widgets as a list you add from (each with its little object), grouped, searchable.
type WidgetItem = { group: string; title: string; note: string; thumb: () => string; get: (s: Settings) => boolean; put: (s: Settings, v: boolean) => void };
const figThumb = (w: number, hgt: number, art: string) => figureSvg(w, hgt, art);
const glyphThumb = (name: string) => `<span class="cz-w-ico">${icon(name, 22)}</span>`;
const WIDGETS: WidgetItem[] = [
  { group: 'Your day', title: 'Clock', note: 'A pocket watch and the date', thumb: () => figThumb(WATCH.width, WATCH.height, WATCH.below + WATCH.above), get: (s) => s.newtab.clock, put: (s, v) => void (s.newtab.clock = v) },
  { group: 'Your day', title: 'Weather', note: 'A weather station: now and four days', thumb: () => figThumb(STATION.width, STATION.height, STATION.back + STATION.mastUpper + STATION.gauge + STATION.thermoSvg), get: (s) => s.newtab.widgets.weather, put: (s, v) => void (s.newtab.widgets.weather = v) },
  { group: 'Your day', title: 'Calendar', note: 'This month; opens your calendar app', thumb: () => figThumb(CUBES.width, CUBES.height, CUBES.art), get: (s) => s.newtab.widgets.calendar, put: (s, v) => void (s.newtab.widgets.calendar = v) },
  { group: 'Focus', title: 'Pomodoro', note: 'A kitchen timer for focus and breaks', thumb: () => figThumb(TIMER.width, TIMER.height, TIMER.below + TIMER.bell + TIMER.drum + TIMER.lever + TIMER.above), get: (s) => s.newtab.widgets.pomodoro, put: (s, v) => void (s.newtab.widgets.pomodoro = v) },
  { group: 'Focus', title: 'To-do', note: 'Done tasks go on the spike; it clears each morning', thumb: () => figThumb(SPIKE.width, SPIKE.height, SPIKE.base + SPIKE.segs.join('') + SPIKE.slips.slice(0, 3).join('') + SPIKE.tip), get: (s) => s.newtab.todo, put: (s, v) => void (s.newtab.todo = v) },
  { group: 'Focus', title: 'Notes', note: 'Sticky notes, kept on this device', thumb: () => figThumb(PAD.width, PAD.height, PAD.art), get: (s) => s.newtab.widgets.notes, put: (s, v) => void (s.newtab.widgets.notes = v) },
  { group: 'Browse', title: 'Bookmarks', note: 'Your sites and folders under the search box', thumb: () => glyphThumb('bookmark'), get: (s) => s.newtab.widgets.bookmarks, put: (s, v) => void (s.newtab.widgets.bookmarks = v) },
  { group: 'Focus', title: 'Calculator', note: 'Quick arithmetic without leaving your new tab', thumb: () => glyphThumb('grid'), get: (s) => s.newtab.widgets.calculator, put: (s, v) => void (s.newtab.widgets.calculator = v) },
  { group: 'Browse', title: 'Reading list', note: 'Articles, videos and books you saved in For you', thumb: () => glyphThumb('book'), get: (s) => s.newtab.widgets.reading, put: (s, v) => void (s.newtab.widgets.reading = v) },
  { group: 'Browse', title: 'Open tabs', note: 'Switch to a page or close a tab', thumb: () => glyphThumb('tab'), get: (s) => s.newtab.widgets.tabs, put: (s, v) => void (s.newtab.widgets.tabs = v) },
  { group: 'Browse', title: 'For you', note: 'Your edition: a short, finite set of picks', thumb: () => glyphThumb('edition'), get: (s) => s.newtab.widgets.feed, put: (s, v) => void (s.newtab.widgets.feed = v) },
  { group: 'Browse', title: 'Greeting', note: 'Good morning, at the top of the search box', thumb: () => glyphThumb('home'), get: (s) => s.newtab.widgets.greeting, put: (s, v) => void (s.newtab.widgets.greeting = v) },
  { group: 'Browse', title: 'Search and Ask switch', note: 'Ask any assistant from the same box', thumb: () => glyphThumb('ask'), get: (s) => s.newtab.aiTab, put: (s, v) => void (s.newtab.aiTab = v) },
];

function addWidgets(ctx: Ctx): HTMLElement {
  const st = ctx.settings;
  const find = h('input', { class: 'text-input cz-w-find', type: 'search', placeholder: 'Search widgets', 'aria-label': 'Search widgets' });
  const list = h('div', { class: 'cz-w-list' });
  const paint = () => {
    const q = find.value.trim().toLowerCase();
    const groups = [...new Set(WIDGETS.map((w) => w.group))];
    list.replaceChildren(
      ...groups.flatMap((g) => {
        const items = WIDGETS.filter((w) => w.group === g && (!q || `${w.title} ${w.note} ${g}`.toLowerCase().includes(q)));
        if (!items.length) return [];
        return [
          h('div', { class: 'cz-w-group' }, g),
          ...items.map((w) => {
            const on = w.get(st);
            return h(
              'div',
              { class: 'cz-w', dataset: { on: String(on) } },
              h('span', { class: 'cz-w-thumb iso', html: w.thumb() }),
              h('span', { class: 'cz-w-text' }, h('b', {}, w.title), h('span', {}, w.note)),
              on
                ? h('button', { type: 'button', class: 'cz-w-on', title: `Remove ${w.title} from the page`, 'aria-label': `${w.title} is on the page. Remove it`, onclick: () => (play('off'), set((s) => w.put(s, false))) }, ico('check', 18), 'On page')
                : h('button', { type: 'button', class: 'cz-w-add', title: `Add ${w.title}`, 'aria-label': `Add ${w.title}`, onclick: () => (play('on'), set((s) => w.put(s, true))) }, ico('plus', 20)),
            );
          }),
        ];
      }),
    );
    if (!list.childElementCount) list.append(h('p', { class: 'cz-hint' }, 'No widget by that name.'));
  };
  find.addEventListener('input', paint);
  paint();
  return h('section', { class: 'cz-sec' }, find, list);
}

const SURFACE_NOTE = {
  clear: 'Lightly tinted panels keep the wallpaper visible and the text readable. No shadows or halos.',
  frosted: 'Frosted glass panels: calm over any picture.',
  solid: 'Solid panels in your colours.',
} as const;

/** Wallpaper owns the surface material; Layout owns widget placement and size. */
function surfaceControl(ctx: Ctx): HTMLElement {
  return h('section', { class: 'cz-sec cz-surface' },
    h('div', { class: 'cz-sec-h' }, 'Widget surfaces'),
    seg(ctx.settings.newtab.panels, [['clear', 'Clear'], ['frosted', 'Glass'], ['solid', 'Solid']], (v) => (play('key'), set((s) => void (s.newtab.panels = v)))),
    h('p', { class: 'cz-hint' }, SURFACE_NOTE[ctx.settings.newtab.panels]));
}

/** One Size control: live while you drag, saved when you let go. */
function sizeSlider(ctx: Ctx): HTMLElement {
  const v = clampScale(ctx.settings.theme.scale);
  const out = h('output', { class: 'cz-val' }, `${v}%`);
  const range = h('input', { type: 'range', min: SCALE_MIN, max: SCALE_MAX, step: 5, value: v, 'aria-label': 'Size' });
  range.addEventListener('input', () => {
    out.textContent = `${range.value}%`;
    applyScale(document.documentElement, Number(range.value));
  });
  range.addEventListener('change', () => set((s) => void (s.theme.scale = clampScale(Number(range.value)))));
  return h('div', { class: 'cz-row' }, h('span', {}, 'Size'), range, out);
}

/** Layout: how widgets sit on the wallpaper, where they go, what's on the page, and how big. */
function layoutTab(ctx: Ctx): HTMLElement {
  const st = ctx.settings;
  return h(
    'div',
    { class: 'cz-themes-wrap' },
    h('p', { class: 'cz-lede' }, 'What’s on the page, where it sits and how big it is.'),
    h(
      'section',
      { class: 'cz-sec' },
      h('div', { class: 'cz-sec-h' }, 'Arrange'),
      h(
        'div',
        { class: 'cz-btnrow' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => (document.querySelector<HTMLElement>('.nt-cz .nt-gear[aria-label="Close"]')?.click(), dispatchEvent(new Event('nt-arrange'))) }, ico('arrange', 18), 'Arrange widgets'),
        h('button', { type: 'button', class: 'btn', onclick: () => (play('dismiss'), set((s) => void (s.newtab.layout = {}))) }, 'Reset layout'),
      ),
      h('p', { class: 'cz-hint' }, 'Drag widgets to move them and change their size. Click a widget’s surface to expand it.'),
      sizeSlider(ctx),
    ),
    addWidgets(ctx),
    h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, 'Weather'), weatherPlace(ctx)),
    h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, 'Calendar'), calendarSettings(ctx)),
    h('section', { class: 'cz-sec' }, h('div', { class: 'cz-sec-h' }, 'Pomodoro'), pomodoroSettings(ctx)),
    nameSection(ctx),
  );
}

/** The panel, plus the button that opens it. Stays open across the page re-rendering after each change. */
export function customize(ctx: Ctx): { button: HTMLElement; panel: HTMLElement } {
  const body = h('div', { class: 'cz-body', role: 'tabpanel', id: 'customize-content' });
  const tabs = h('div', { class: 'cz-tabs', role: 'tablist', 'aria-label': 'Customize sections' });
  const panel = h('aside', { class: 'nt-cz', role: 'dialog', 'aria-label': 'Customize', hidden: true }, h('header', { class: 'cz-head' }, h('b', {}, 'Customize'), tabs, h('button', { type: 'button', class: 'nt-gear', 'aria-label': 'Close', onclick: () => close() }, ico('close', 18))), body);
  const OLD: Record<string, string> = { theme: 'colours', background: 'wallpaper', widgets: 'layout' };
  let tab = OLD[recalled()] ?? (recalled() || 'wallpaper');
  let showToken = 0;
  const show = async (t: string) => {
    const token = ++showToken;
    tab = t;
    remember(t);
    tabs.replaceChildren(
      ...([['wallpaper', 'Wallpaper'], ['colours', 'Colours'], ['layout', 'Layout']] as const).map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', id: `customize-${id}`, tabindex: id === t ? 0 : -1, 'aria-controls': 'customize-content', 'aria-selected': String(id === t), onclick: () => void show(id) }, label),
      ),
    );
    const content = t === 'colours' ? coloursTab(ctx) : t === 'layout' ? layoutTab(ctx) : await backgroundTab(ctx);
    if (token !== showToken || panel.hidden || ctx.signal?.aborted) return;
    body.setAttribute('aria-labelledby', `customize-${t}`);
    body.replaceChildren(content);
    body.scrollTop = scrollMemo[t] ?? 0;
  };
  body.addEventListener('scroll', () => {
    scrollMemo = { ...scrollMemo, [tab]: body.scrollTop };
  });
  tabs.addEventListener('keydown', (e) => {
    const ids = ['wallpaper', 'colours', 'layout'];
    const i = ids.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % ids.length : e.key === 'ArrowLeft' ? (i + ids.length - 1) % ids.length : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    void show(ids[next]);
    tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  });
  const open = () => {
    if (ctx.signal?.aborted) return;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.documentElement.dataset.cz = '1';
    void show(tab);
  };
  const close = () => {
    showToken++;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    delete document.documentElement.dataset.cz;
    remember('');
    button.focus({ preventScroll: true });
  };
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && close(), { signal: ctx.signal });
  const [bg, ink, accent] = ctx.settings.newtab.look === 'custom' ? [ctx.settings.newtab.custom.bg, ctx.settings.newtab.custom.ink, ctx.settings.newtab.custom.accent] : (THEMES.find((t) => t.id === ctx.settings.newtab.look) ?? THEMES[0]).swatch;
  const button = h(
    'button',
    { type: 'button', class: 'nt-gear nt-cz-btn', title: 'Customize: wallpaper, colours and layout', 'aria-label': 'Customize', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => (panel.hidden ? open() : close()) },
    ico('palette', 18),
    h('i', { class: 'cz-dot', 'aria-hidden': 'true', style: { background: `linear-gradient(135deg, ${bg} 50%, ${ink} 50%)`, boxShadow: `0 0 0 1.5px ${accent}` } }),
  );
  if (recalled()) queueMicrotask(open);
  return { button, panel };
}
