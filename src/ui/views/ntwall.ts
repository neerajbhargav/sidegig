// New tab backgrounds. Pictures (a calm landscape, a public-domain monument,
// your own upload or a link) show as photos in Match browser and, in the
// studio themes, as two-tone risograph prints in the theme's own inks (after
// Gabe Tognon's "Risograph Monumentalism"). There are also mesh gradients,
// industrial patterns and plain colours. Collections (cars, anime, tech or
// your own keywords) collect wallpapers on their own and rotate. A veil keeps
// text readable.
import { uid } from '../../shared/api.ts';
import { getLocal, setLocal } from '../../shared/storage.ts';
import type { BgEffect, NtBackground } from '../../shared/types.ts';
import { pickIndex, type Palette, type RotState } from '../../shared/walls.ts';
import { albumImage, findCollection, getPool, hiddenWalls } from '../../shared/collect.ts';
import { h } from '../dom.ts';
import type { Ctx } from '../ctx.ts';
import { led, loadBitmap, mosaic, paletteOf } from './ntfx.ts';
import { fitOnSignal } from './newtab.ts';

/** Picsum ids picked for open sky and room for text: sea, fog, hills, piers, desert. */
export const LANDSCAPES = [10, 11, 12, 13, 14, 16, 17, 28, 29, 37, 38, 44, 46, 47, 49, 51, 52, 53, 54, 62, 66, 70, 71, 74, 77, 79, 83, 87, 93, 95];

/** Public-domain sculpture from the Art Institute of Chicago (CC0), mostly on dark grounds. */
export const MONUMENTS: [string, string][] = [
  ['34133244-99a5-246f-c72f-76f32e55d253', 'Portrait Bust of a Woman'],
  ['95d7115d-3f78-ce6a-d174-d8f3581c9aa4', 'Portrait Head of a Woman'],
  ['fae6d055-fe95-17e2-a00a-c2307ace531c', 'Bust of the Comtesse de Pange'],
  ['6ddbfb36-be11-1691-c6fc-384fb6fc2671', 'Mademoiselle Jubin'],
  ['4e37b182-cc1e-ef86-3eb2-de7d5b9db717', 'Bust of a Youth (Saint John the Baptist)'],
  ['71130695-fd22-c41c-bd27-4f0a7cf20299', 'Bust of a Nobleman in Armor'],
  ['83187f51-4e76-e104-8b2b-f8b7a40531fc', 'Portrait Head of a Woman'],
  ['4ba54d83-416b-92bf-6098-89ffec76a496', 'Portrait Head of Emperor Hadrian'],
  ['3e41420d-2bae-5863-1980-fd39a78e1ffe', 'Bust of Paris'],
  ['b3c824b5-b972-ad4d-11c1-61334741129e', 'Portrait Head of Antinous'],
  ['7502d86c-1387-4ae7-f334-94245a52ddd0', 'Portrait Head of a Youth'],
  ['2d078cd6-8cb3-87ec-8232-fc458dddc1a5', 'Portrait Head of a Young Woman'],
  ['38ea638d-c8f7-f916-da08-ac7730b6ed5a', 'Statuette of a Seated Girl'],
  ['598b9079-165f-7869-d5d0-c3d0658e8341', 'Torso of a Youth'],
  ['b193b8a4-1a97-ee40-918c-cf1f92cf6a9b', 'Head of an Official'],
];

/** Soft mesh gradients (after the calm, airy Super Visuals backgrounds). */
export const GRADIENTS: { id: string; name: string; css: string }[] = [
  { id: 'dawn', name: 'Dawn', css: 'radial-gradient(at 18% 12%, #ffd8c4 0, transparent 52%), radial-gradient(at 82% 4%, #c9d6ff 0, transparent 50%), radial-gradient(at 50% 100%, #fff0d4 0, transparent 60%), #f7f2ec' },
  { id: 'haze', name: 'Haze', css: 'radial-gradient(at 25% 20%, #e3dcff 0, transparent 55%), radial-gradient(at 80% 30%, #d6ecff 0, transparent 50%), radial-gradient(at 60% 95%, #f4e6ff 0, transparent 55%), #f3f2f8' },
  { id: 'dune', name: 'Dune', css: 'radial-gradient(at 30% 85%, #d9774a 0, transparent 45%), radial-gradient(at 75% 70%, #e8a47c 0, transparent 50%), radial-gradient(at 50% 10%, #f6e6d4 0, transparent 60%), #efd9c4' },
  { id: 'lagoon', name: 'Lagoon', css: 'radial-gradient(at 20% 30%, #2f8f83 0, transparent 50%), radial-gradient(at 80% 20%, #9fd3a8 0, transparent 55%), radial-gradient(at 55% 95%, #1f6b6a 0, transparent 55%), #5aa59a' },
  { id: 'aurora', name: 'Aurora', css: 'radial-gradient(at 20% 10%, #2b6b58 0, transparent 50%), radial-gradient(at 85% 25%, #4a2f7a 0, transparent 55%), radial-gradient(at 50% 100%, #0f2d3a 0, transparent 60%), #0b1014' },
  { id: 'cobalt', name: 'Cobalt', css: 'radial-gradient(at 70% 20%, #4d5dff 0, transparent 45%), radial-gradient(at 20% 80%, #0a12a8 0, transparent 55%), #0a12e6' },
];

/** Industrial patterns drawn in the theme's own ink. */
export const PATTERNS: { id: string; name: string }[] = [
  { id: 'grille', name: 'Speaker grille' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'scan', name: 'Scanlines' },
];

export interface Upload {
  id: string;
  url: string;
  at: number;
}

/** Your pictures, kept on this device. The old single wallpaper joins the library on first use. */
export async function listUploads(): Promise<Upload[]> {
  let ups = await getLocal<Upload[]>('ntUploads', []);
  const legacy = await getLocal<string>('ntWallpaper', '');
  if (legacy && !ups.some((u) => u.id === 'legacy')) {
    ups = [{ id: 'legacy', url: legacy, at: Date.now() }, ...ups];
    await setLocal('ntUploads', ups);
  }
  return ups;
}

export async function addUpload(url: string): Promise<Upload> {
  const up: Upload = { id: uid('bg_'), url, at: Date.now() };
  await setLocal('ntUploads', [up, ...(await listUploads())].slice(0, 12));
  return up;
}

export async function removeUpload(id: string) {
  await setLocal('ntUploads', (await listUploads()).filter((u) => u.id !== id));
  if (id === 'legacy') await setLocal('ntWallpaper', '');
}

/** Shrink a picture so it fits comfortably on this device. */
export async function prepareImage(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

const dayIndex = () => Math.floor(Date.now() / 86_400_000 - new Date().getTimezoneOffset() / 1440);
export const landscapeUrl = (id: number, w = 2400, h = 1500) => `https://picsum.photos/id/${id}/${w}/${h}`;
export const monumentUrl = (i: number, w = 1686) => `https://www.artic.edu/iiif/2/${MONUMENTS[i][0]}/full/${w},/0/default.jpg`;

export interface Picture {
  url: string;
  credit?: string;
  /** Where the credit links to. */
  link?: string;
  /** Stable id for caching and hiding. */
  id: string;
  /** Set for collection pictures. */
  collection?: string;
  /** What to preload for next time. */
  next?: string;
  /** Tall or square pictures: show all of it over a soft blurred copy instead of cropping. */
  contain?: boolean;
}

async function landscapeCredit(id: number): Promise<string | undefined> {
  const cache = await getLocal<Record<string, string>>('ntPhotoCredits', {});
  if (cache[id]) return cache[id];
  try {
    const info = await (await fetch(`https://picsum.photos/id/${id}/info`, { credentials: 'omit' })).json();
    if (info?.author) {
      cache[id] = `Photo: ${info.author} on Unsplash`;
      await setLocal('ntPhotoCredits', cache);
      return cache[id];
    }
  } catch {
    /* no credit then */
  }
  return undefined;
}

/** Collection rotation advances once per new tab, not on every re-render. */
const advanced = new Set<string>();

async function collectionPicture(ctx: Ctx, bg: NtBackground): Promise<Picture | null> {
  const c = findCollection(bg.ref, ctx.settings.newtab.collections);
  if (!c) return null;
  const pool = await getPool(c);
  if (!pool?.items.length) return null;
  const hidden = new Set(await hiddenWalls());
  const items = pool.items.filter((it) => !hidden.has(it.id));
  if (!items.length) return null;
  const rotate = bg.rotate ?? 'tab';
  const key = `ntRot:${c.id}`;
  const st = await getLocal<RotState>(key, { i: 0, skip: 0 });
  if (rotate === 'tab' && !advanced.has(c.id)) {
    advanced.add(c.id);
    st.i = (st.i + 1) % Math.max(1, items.length);
    await setLocal(key, st);
  }
  const n = pickIndex(items.length, rotate, Date.now(), st);
  const it = items[n];
  const nx = items[(n + 1) % items.length];
  // Your own pictures live on this device.
  const url = it.src.startsWith('local:') ? await albumImage(it.src.slice(6)) : it.src;
  if (!url) return null;
  return {
    id: it.id,
    url,
    credit: it.title ? `${it.title} · ${it.credit}` : `${c.name} · ${it.credit}`,
    link: it.link || undefined,
    collection: c.id,
    next: nx && nx !== it && !nx.src.startsWith('local:') ? nx.src : undefined,
    contain: it.w > 0 && it.h > 0 && it.w / it.h < 1.25,
  };
}

/** Show the next picture in this collection (the "next" button). */
export async function skipWall(id: string): Promise<void> {
  const key = `ntRot:${id}`;
  const st = await getLocal<RotState>(key, { i: 0, skip: 0 });
  await setLocal(key, { ...st, skip: st.skip + 1 });
}

async function picture(ctx: Ctx, bg: NtBackground): Promise<Picture | null> {
  const i = dayIndex();
  const monument = (n: number): Picture => ({ id: `m:${n}`, url: monumentUrl(n), credit: `${MONUMENTS[n][1]} · Art Institute of Chicago · public domain`, link: 'https://www.artic.edu/' });
  const landscape = async (id: number): Promise<Picture> => ({ id: `p:${id}`, url: landscapeUrl(id), credit: await landscapeCredit(id), link: `https://picsum.photos/id/${id}/info` });
  switch (bg.kind) {
    case 'collection':
      return collectionPicture(ctx, bg);
    case 'daily':
      return landscape(LANDSCAPES[i % LANDSCAPES.length]);
    case 'monuments':
      return monument(i % MONUMENTS.length);
    case 'photo': {
      const [src, n] = bg.ref.split(':');
      if (src === 'm' && MONUMENTS[Number(n)]) return monument(Number(n));
      if (src === 'p' && Number(n) >= 0) return landscape(Number(n));
      return null;
    }
    case 'upload': {
      const ups = await listUploads();
      const up = ups.find((u) => u.id === bg.ref) ?? ups[0];
      return up ? { id: `u:${up.id}`, url: up.url, credit: 'Your picture' } : null;
    }
    case 'url':
      return /^https?:\/\//.test(bg.ref) ? { id: `url:${bg.ref.slice(0, 200)}`, url: bg.ref } : null;
    default:
      return null;
  }
}

const hex = (c: string): [number, number, number] => {
  const m = c.trim().match(/^#?([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const r = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return [Math.round(r[0] ?? 0), Math.round(r[1] ?? 0), Math.round(r[2] ?? 0)];
};
const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The theme's two inks: shadows print in the dark one, light in the other. Paper gets indigo, like a riso drum. */
function inks(): [[number, number, number], [number, number, number]] {
  const root = document.documentElement;
  if (root.dataset.look === 'paper') return [hex('#1f2a7a'), hex('#efefea')];
  // Resolve the variables to real colours (they may be color-mix() expressions).
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0;color:var(--c-bg);background-color:var(--c-ink)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const a = hex(cs.color);
  const b = hex(cs.backgroundColor);
  probe.remove();
  return lum(a) < lum(b) ? [a, b] : [b, a];
}

/**
 * Two-tone stochastic print: grayscale, auto levels, a soft S-curve, then each
 * cell is ink or paper against interleaved-gradient noise plus a little wobble,
 * which reads like risograph grain rather than a mechanical screen.
 */
export async function risograph(blob: Blob, w: number, h: number, dark: number[], light: number[]): Promise<string> {
  const img = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const s = Math.max(w / img.width, h / img.height);
  x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  const data = x.getImageData(0, 0, w, h);
  const p = data.data;
  const n = w * h;
  const L = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2];
    L[i] = l;
    hist[l | 0]++;
  }
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc < n * 0.01) lo = v;
    if (acc < n * 0.99) hi = v;
  }
  const span = Math.max(1, hi - lo);
  for (let y = 0; y < h; y++) {
    for (let xx = 0; xx < w; xx++) {
      const i = y * w + xx;
      let v = Math.min(1, Math.max(0, (L[i] - lo) / span));
      v = v * v * (3 - 2 * v);
      const t = (52.9829189 * ((0.06711056 * xx + 0.00583715 * y) % 1)) % 1;
      const col = v + (Math.random() * 0.2 - 0.1) > t ? light : dark;
      p[i * 4] = col[0];
      p[i * 4 + 1] = col[1];
      p[i * 4 + 2] = col[2];
      p[i * 4 + 3] = 255;
    }
  }
  x.putImageData(data, 0, 0);
  return c.toDataURL('image/png');
}

/** The effect a picture gets here. Auto: photos in Match browser; studio themes print gallery pictures and film collections. */
export function effectFor(bg: NtBackground, look = document.documentElement.dataset.look): Exclude<BgEffect, 'auto'> {
  if (bg.treatment && bg.treatment !== 'auto') return bg.treatment;
  if (bg.kind === 'monuments' || bg.ref.startsWith('m:')) return 'print';
  if (look === 'native' || look === 'picture') return 'photo';
  if (bg.kind === 'collection' || bg.kind === 'upload' || bg.kind === 'url') return 'film';
  return 'print';
}
/** Kept for callers that only ask "is this printed?". */
export const printsHere = (bg: NtBackground) => effectFor(bg) === 'print';

/** Apply a palette as the "From picture" theme, and remember it so the next tab paints in it. */
export function applyPalette(pal: Palette) {
  const root = document.documentElement;
  root.style.setProperty('--c-bg', pal.bg);
  root.style.setProperty('--c-ink', pal.ink);
  if (!root.style.getPropertyValue('--c-signal') || root.dataset.accent !== 'user') root.style.setProperty('--c-signal', pal.accent);
  root.dataset.scheme = pal.dark ? 'dark' : 'light';
  root.dataset.pal = pal.dark ? 'dark' : 'light';
  fitOnSignal();
  try {
    localStorage.setItem('sidegig.ntPicture', JSON.stringify(pal));
  } catch {
    /* fine */
  }
}

async function cachedFx(key: string, make: () => Promise<string>): Promise<string> {
  const cache = await getLocal<{ key: string; url: string }[]>('ntFx', []);
  const hit = cache.find((c) => c.key === key);
  if (hit) return hit.url;
  const url = await make();
  // A few recent renders (current + next) keep flipping instant without filling storage.
  await setLocal('ntFx', [{ key, url }, ...cache.filter((c) => c.key !== key)].slice(0, 4));
  return url;
}

export async function wallpaperEl(ctx: Ctx): Promise<HTMLElement | null> {
  const bg = ctx.settings.newtab.background;
  if (bg.kind === 'none') return null;
  const wrap = h('div', { class: 'nt-wall', 'aria-hidden': 'true', dataset: { kind: bg.kind } });
  wrap.style.setProperty('--wall-dim', String(Math.max(0, Math.min(90, bg.dim)) / 100));
  wrap.style.setProperty('--wall-blur', `${Math.max(0, Math.min(24, bg.blur))}px`);

  if (bg.kind === 'gradient') {
    wrap.append(h('div', { class: 'wall-fill', style: { background: (GRADIENTS.find((g) => g.id === bg.ref) ?? GRADIENTS[0]).css } }));
    return wrap;
  }
  if (bg.kind === 'pattern') {
    wrap.append(h('div', { class: `wall-fill wall-${PATTERNS.some((p) => p.id === bg.ref) ? bg.ref : 'grille'}` }));
    return wrap;
  }
  if (bg.kind === 'color') {
    wrap.append(h('div', { class: 'wall-fill', style: { background: /^#[0-9a-f]{6}$/i.test(bg.ref) ? bg.ref : '#1d1b16' } }));
    return wrap;
  }

  const pic = await picture(ctx, bg);
  if (!pic) {
    // A collection still loading (first run, offline): a calm gradient instead of nothing.
    if (bg.kind !== 'collection') return null;
    wrap.dataset.kind = 'gradient';
    wrap.dataset.loading = 'true';
    wrap.append(h('div', { class: 'wall-fill', style: { background: GRADIENTS[4].css } }));
    return wrap;
  }
  if (pic.credit) wrap.dataset.credit = pic.credit;
  if (pic.link) wrap.dataset.link = pic.link;
  wrap.dataset.pic = pic.id;
  if (pic.collection) wrap.dataset.collection = pic.collection;
  const fx = effectFor(bg);
  wrap.dataset.fx = fx;
  wrap.dataset.print = String(fx === 'print');
  const wantPalette = ctx.settings.newtab.look === 'picture';

  // Preload the next picture so the next tab is instant.
  if (pic.next) setTimeout(() => void fetch(pic.next!, { credentials: 'omit' }).catch(() => undefined), 2500);

  if (fx === 'photo' || fx === 'film' || fx === 'dream') {
    if (pic.contain) {
      wrap.dataset.fit = 'contain';
      wrap.append(h('img', { src: pic.url, alt: '', decoding: 'async', class: 'wall-backdrop' }));
    }
    const img = h('img', { src: pic.url, alt: '', decoding: 'async', referrerpolicy: 'no-referrer', class: 'wall-photo' });
    img.addEventListener('error', () => wrap.remove(), { once: true });
    wrap.append(img);
    if (fx === 'film') wrap.append(h('div', { class: 'wall-grain' }));
    if (fx === 'dream') wrap.append(h('div', { class: 'wall-dots' }));
    if (wantPalette) void paletteFor(pic).then((p) => p && applyPalette(p));
    return wrap;
  }

  // Canvas effects render at half resolution (print) or full CSS size (LED, mosaic).
  const half = fx === 'print';
  const w = Math.round(innerWidth / (half ? 2 : 1));
  const hgt = Math.round(innerHeight / (half ? 2 : 1));
  const [dark, light] = inks();
  const key = `fx2:${fx}:${pic.id}:${pic.url.length > 300 ? pic.url.length : pic.url}:${fx === 'print' ? `${dark}:${light}` : fx === 'mosaic' ? light : ''}:${w}x${hgt}`;
  const img = h('img', { alt: '', decoding: 'async', class: fx === 'print' ? 'riso' : `fx-${fx}` });
  wrap.append(img);
  void (async () => {
    try {
      let bmp: ImageBitmap | null = null;
      const load = async () => (bmp ??= await loadBitmap(pic.url));
      img.src = await cachedFx(key, async () => {
        if (fx === 'print') return risograph(await (await fetch(pic.url, { credentials: 'omit' })).blob(), w, hgt, dark, light);
        if (fx === 'led') return led(await load(), w, hgt);
        return mosaic(await load(), w, hgt, `rgb(${light.join(',')})`);
      });
      if (wantPalette) {
        const p = await paletteFor(pic, bmp ?? undefined);
        if (p) applyPalette(p);
      }
    } catch {
      wrap.remove();
    }
  })();
  return wrap;
}

/** The picture's palette, cached by picture. */
async function paletteFor(pic: Picture, bmp?: ImageBitmap): Promise<Palette | null> {
  const cache = await getLocal<Record<string, Palette>>('ntPal', {});
  if (cache[pic.id]) return cache[pic.id];
  try {
    const pal = paletteOf(bmp ?? (await loadBitmap(pic.url)));
    const keys = Object.keys(cache);
    if (keys.length > 60) delete cache[keys[0]];
    cache[pic.id] = pal;
    await setLocal('ntPal', cache);
    return pal;
  } catch {
    return null;
  }
}
