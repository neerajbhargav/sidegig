// Wallpaper collections: pick a theme pack (cars, anime, tech...) or type your
// own keywords, and sidegig collects wallpapers for it from free, keyless
// sources, refreshes them on its own and rotates through them.
//
// Pure helpers live here (URLs, parsing, mixing, rotation, palette) so they can
// be tested against real responses. Fetching and caching is in collect.ts.

export type WallSource = 'wallhaven' | 'nasa' | 'bing';

export interface Collection {
  id: string;
  name: string;
  /** Search phrases, mixed evenly. */
  terms: string[];
  /** Include anime and illustration (Wallhaven's anime category). */
  anime?: boolean;
  /** Only anime/illustration. */
  animeOnly?: boolean;
  sources?: WallSource[];
  note?: string;
  /** Made from your own pictures (kept on this device), not searched for. */
  album?: boolean;
}

export interface WallItem {
  id: string;
  src: string;
  thumb: string;
  w: number;
  h: number;
  /** Where it came from, shown as a link. */
  link: string;
  credit: string;
  title?: string;
  /** Up to five dominant colours when the source knows them. */
  colors?: string[];
  term: string;
  /** How loved it is: 0–1 from favourites and like rate (or the source's own curation). */
  pop: number;
  /** How well it sits behind a new tab: 0–1 (calm, not busy, not empty). Unknown until measured. */
  fit?: number;
  /** Final rank: popularity and fit together. */
  score: number;
}

export type Rotate = 'tab' | 'hour' | 'day';

/** Theme packs people relate to. Terms are tuned against real results. */
export const PACKS: Collection[] = [
  { id: 'cars', name: 'Cars', terms: ['porsche 911', 'jdm', 'supercar', 'classic car', 'nissan gt-r'], note: 'Porsche, JDM, supercars' },
  { id: 'anime', name: 'Anime', terms: ['anime landscape', 'studio ghibli', 'makoto shinkai', 'naruto', 'anime city'], animeOnly: true, note: 'Scenery, Ghibli, Shinkai, Naruto' },
  { id: 'tech', name: 'Tech', terms: ['cyberpunk city', 'technology', 'circuit board', 'programming', 'technology abstract'], anime: true, note: 'Cyberpunk, circuits, code' },
  { id: 'space', name: 'Space', terms: ['nebula', 'galaxy', 'earth from space', 'planet'], sources: ['nasa', 'wallhaven'], note: 'NASA and the night sky' },
  { id: 'motorcycles', name: 'Motorcycles', terms: ['motorcycle', 'superbike', 'ducati', 'motorcycle night'], note: 'Superbikes, Ducati, night rides' },
  { id: 'cities', name: 'Cities', terms: ['city night', 'tokyo', 'new york skyline', 'city rain'], note: 'Neon, rain, skylines' },
  { id: 'nature', name: 'Nature', terms: ['mountains', 'forest', 'ocean waves', 'desert dunes'], sources: ['bing', 'wallhaven'], note: 'With Bing’s photo of the day' },
  { id: 'gaming', name: 'Gaming', terms: ['elden ring', 'cyberpunk 2077', 'zelda breath of the wild', 'red dead redemption 2'], anime: true, note: 'Elden Ring, Zelda, RDR2' },
  { id: 'architecture', name: 'Architecture', terms: ['architecture', 'modern architecture', 'interior design', 'japanese architecture'], note: 'Glass, concrete, quiet rooms' },
  { id: 'minimal', name: 'Minimal', terms: ['minimalism', 'abstract', 'simple background'], anime: true, note: 'Calm and simple' },
];

export const MAX_POOL = 60;
/** Below this a picture fights the new tab (too busy or empty). */
export const MIN_FIT = 0.3;
export const MIN_FAVORITES = 15;
/** Things that never make a good backdrop. Wallhaven drops anything with these tags. */
const NOT = ' -text -typography -collage -infographic -logo -meme -screenshot -comics -manga -watermarked -quote';

const enc = encodeURIComponent;

/**
 * Wallhaven: keyword search, safe-for-work only, screen-shaped, at least 1440p,
 * the most-favourited first (the pictures a lot of people loved).
 */
export function wallhavenUrl(term: string, c: Pick<Collection, 'anime' | 'animeOnly'>, page = 1): string {
  const cats = c.animeOnly ? '010' : c.anime ? '110' : '100';
  return `https://wallhaven.cc/api/v1/search?q=${enc(term + NOT)}&categories=${cats}&purity=100&sorting=favorites&order=desc&atleast=2560x1440&ratios=16x9,16x10&page=${page}`;
}

/** 0–1 popularity: favourites on a log scale (about 1,600 = top), plus how many viewers loved it. */
export function popularity(favorites: number, views: number): number {
  const fav = Math.min(1, Math.log10(1 + Math.max(0, favorites)) / 3.2);
  const rate = views > 50 ? Math.min(1, favorites / views / 0.012) : 0;
  return 0.75 * fav + 0.25 * rate;
}

export const rankScore = (pop: number, fit?: number) => (fit === undefined ? pop * 0.85 : 0.6 * pop + 0.4 * fit);

/**
 * How well a picture sits behind the new tab, from a small RGBA sample:
 * busy pictures (collages, clutter) and empty ones (nearly flat black) score
 * low; colour helps; a calmer left side (where the clock sits) helps.
 */
export function fitScore(px: Uint8ClampedArray | number[], w: number, h: number): number {
  const n = w * h;
  if (n < 9 || px.length < n * 4) return 0.5;
  const L = new Float32Array(n);
  let sr = 0;
  let sy = 0;
  let srr = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const R = px[i * 4];
    const G = px[i * 4 + 1];
    const B = px[i * 4 + 2];
    L[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    const rg = R - G;
    const yb = 0.5 * (R + G) - B;
    sr += rg;
    sy += yb;
    srr += rg * rg;
    syy += yb * yb;
  }
  // Hasler–Süsstrunk colourfulness.
  const col = (Math.sqrt(Math.max(0, srr / n - (sr / n) ** 2 + syy / n - (sy / n) ** 2)) + 0.3 * Math.sqrt((sr / n) ** 2 + (sy / n) ** 2)) / 100;
  let E = 0;
  let El = 0;
  let nl = 0;
  let strong = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const g = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]);
      E += g;
      if (g > 0.25) strong++;
      if (x < w * 0.45) {
        El += g;
        nl++;
      }
    }
  }
  const m = (w - 2) * (h - 2);
  E /= m;
  El /= Math.max(1, nl);
  if (strong / m > 0.4) return 0;
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const busy = clamp((E - 0.13) / 0.12);
  // Flat and dull (near-black, grey) is empty; a smooth colourful gradient isn't.
  const colourful = clamp(col / 0.6);
  const empty = clamp((0.02 - E) / 0.015) * (1 - 0.8 * colourful);
  const leftCalm = E > 0 ? clamp((E - El) / E, -0.5, 0.5) : 0;
  return clamp(0.55 + 0.25 * colourful * (1 - busy) + 0.2 * leftCalm - 0.6 * busy - 0.5 * empty);
}
export const nasaUrl = (term: string) => `https://images-api.nasa.gov/search?q=${enc(term)}&media_type=image&page_size=60`;
export const bingUrl = (idx = 0) => `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=8&mkt=en-US`;

interface WallhavenJson {
  data?: { id: string; path: string; url: string; favorites?: number; views?: number; dimension_x?: number; dimension_y?: number; colors?: string[]; file_type?: string; thumbs?: { large?: string; original?: string; small?: string }; purity?: string }[];
}
export function parseWallhaven(json: WallhavenJson, term: string): WallItem[] {
  const data = (json.data ?? []).filter((d) => d.purity === undefined || d.purity === 'sfw');
  // Keep the well-loved: an absolute floor, and a floor relative to this search's best.
  const top = Math.max(0, ...data.map((d) => d.favorites ?? 0));
  const floor = Math.max(MIN_FAVORITES, top * 0.12);
  return data
    .filter((d) => (d.favorites ?? 0) >= floor && (d.dimension_x ?? 0) >= 1600 && (d.dimension_x ?? 0) >= (d.dimension_y ?? 0) * 1.3)
    .map((d) => ({
      id: `wh:${d.id}`,
      src: d.path,
      thumb: d.thumbs?.large ?? d.thumbs?.small ?? d.path,
      w: d.dimension_x ?? 0,
      h: d.dimension_y ?? 0,
      link: d.url,
      credit: 'Wallhaven',
      colors: d.colors,
      term,
      pop: popularity(d.favorites ?? 0, d.views ?? 0),
      score: rankScore(popularity(d.favorites ?? 0, d.views ?? 0)),
    }));
}

interface NasaJson {
  collection?: { items?: { data?: { nasa_id?: string; title?: string; keywords?: string[]; center?: string }[]; links?: { href?: string }[] }[] };
}
/** NASA's image library: public domain. Skips diagrams, charts and people at podiums. */
export function parseNasa(json: NasaJson, term: string): WallItem[] {
  const junk = /diagram|chart|graph|logo|poster|briefing|press conference|portrait|astronaut .* (suit|training)|illustration of|artist'?s concept of a spacecraft|infographic/i;
  return (json.collection?.items ?? [])
    .map((it, i) => ({ d: it.data?.[0], href: it.links?.[0]?.href ?? '', i }))
    .filter(({ d, href }) => d?.nasa_id && href && !junk.test(`${d.title ?? ''} ${(d.keywords ?? []).join(' ')}`))
    .map(({ d, href, i }) => {
      const id = d!.nasa_id!;
      const base = `https://images-assets.nasa.gov/image/${enc(id)}/${enc(id)}`;
      return {
        id: `nasa:${id}`,
        src: `${base}~large.jpg`,
        thumb: href,
        w: 0,
        h: 0,
        link: `https://images.nasa.gov/details/${enc(id)}`,
        credit: 'NASA',
        title: d!.title,
        term,
        // NASA has no likes: its own search order is the best signal there is.
        pop: Math.max(0.35, 0.7 - i * 0.008),
        score: rankScore(Math.max(0.35, 0.7 - i * 0.008)),
      };
    });
}

interface BingJson {
  images?: { urlbase?: string; title?: string; copyright?: string; copyrightlink?: string; startdate?: string }[];
}
export function parseBing(json: BingJson): WallItem[] {
  return (json.images ?? [])
    .filter((i) => i.urlbase)
    .map((i, n) => ({
      id: `bing:${i.urlbase!.replace(/^.*id=/, '')}`,
      src: `https://www.bing.com${i.urlbase}_UHD.jpg`,
      thumb: `https://www.bing.com${i.urlbase}_400x240.jpg`,
      w: 3840,
      h: 2160,
      link: i.copyrightlink || 'https://www.bing.com',
      credit: (i.copyright ?? 'Bing').replace(/\s+/g, ' ').trim(),
      title: i.title,
      term: 'photo of the day',
      // Bing's photo of the day is picked by editors: treat as well loved.
      pop: 0.8 - n * 0.01,
      score: rankScore(0.8 - n * 0.01),
    }));
}

/** Near-duplicates (the same picture uploaded twice) share size and palette. */
const sameKey = (it: WallItem) => (it.colors?.length ? `${it.w}x${it.h}:${it.colors.join('')}` : it.id);

/**
 * Mix results evenly across search terms (best first within each term), drop
 * duplicates, hidden pictures and poor fits, cap the pool.
 */
export function mixPool(lists: WallItem[][], hidden: string[] = [], max = MAX_POOL): WallItem[] {
  const byTerm = new Map<string, WallItem[]>();
  for (const it of lists.flat()) {
    if (it.fit !== undefined && it.fit < MIN_FIT) continue;
    byTerm.set(it.term, [...(byTerm.get(it.term) ?? []), it]);
  }
  const queues = [...byTerm.values()].map((l) => [...l].sort((a, b) => b.score - a.score));
  const seen = new Set<string>();
  const hide = new Set(hidden);
  const out: WallItem[] = [];
  for (let round = 0; out.length < max && queues.some((q) => q.length); round++) {
    for (const q of queues) {
      // A duplicate or hidden picture doesn't cost this term its turn.
      let it = q.shift();
      while (it && (seen.has(it.id) || seen.has(sameKey(it)) || hide.has(it.id))) it = q.shift();
      if (!it) continue;
      seen.add(it.id);
      seen.add(sameKey(it));
      out.push(it);
      if (out.length >= max) break;
    }
  }
  return out;
}

export interface RotState {
  /** Position for "every new tab". */
  i: number;
  /** Extra steps from "next wallpaper". */
  skip: number;
}

/** Which picture to show now. Hourly and daily stay put until the period turns over. */
export function pickIndex(n: number, rotate: Rotate, now: number, st: RotState): number {
  if (n <= 0) return -1;
  const period = rotate === 'hour' ? 3_600_000 : 86_400_000;
  const base = rotate === 'tab' ? st.i : Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / period);
  return (((base + st.skip) % n) + n) % n;
}

/** Turn a typed line into a collection: "porsche 911, nismo gt-r" → two terms. */
export function collectionFromKeywords(line: string, anime = true): Collection | null {
  const terms = [...new Set(line.split(/[,;\n]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 48))].slice(0, 6);
  if (!terms.length) return null;
  const name = terms.length === 1 ? terms[0].replace(/\b\w/g, (c) => c.toUpperCase()) : terms.slice(0, 2).map((t) => t.replace(/\b\w/g, (c) => c.toUpperCase())).join(' + ');
  const id = `k:${terms.join('|')}`.slice(0, 120);
  return { id, name, terms, anime };
}

// ------------------------------------------------------------ palette

type RGB = [number, number, number];
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (c: RGB) => {
  const mx = Math.max(...c);
  const mn = Math.min(...c);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

export interface Palette {
  bg: string;
  ink: string;
  accent: string;
  dark: boolean;
}

/**
 * A theme from a picture's pixels (RGBA, any size): k-means for the main
 * colours, the page from the picture's own shadows or highlights, and the most
 * vivid colour that still reads against the page as the accent.
 */
export function paletteFromPixels(px: Uint8ClampedArray | number[], k = 6): Palette {
  const pts: RGB[] = [];
  for (let i = 0; i + 3 < px.length; i += 4) if (px[i + 3] > 128) pts.push([px[i], px[i + 1], px[i + 2]]);
  if (!pts.length) return { bg: '#111111', ink: '#f2f0ea', accent: '#ff5a1f', dark: true };
  // Seed centres spread across brightness, then refine.
  const sorted = [...pts].sort((a, b) => luminance(a) - luminance(b));
  let centres: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length))]);
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    const sums = centres.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of pts) {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    centres = centres.map((c, j) => (counts[j] ? [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]] : c));
  }
  const total = pts.length;
  const avg = pts.reduce((s, p) => s + luminance(p), 0) / total;
  const dark = avg < 0.32;
  const clusters = centres.map((c, j) => ({ c, w: counts[j] / total })).filter((x) => x.w > 0.01);
  // Page: the picture's own shadow (or highlight), pushed toward black (or white) so text always reads.
  const byL = [...clusters].sort((a, b) => luminance(a.c) - luminance(b.c));
  const base = dark ? byL[0].c : byL[byL.length - 1].c;
  const bg: RGB = dark ? mix(base, [8, 8, 10], 0.55) : mix(base, [250, 249, 246], 0.72);
  const ink: RGB = dark ? mix([244, 242, 236], base, 0.08) : mix([18, 18, 20], base, 0.12);
  // Accent: vivid and present, and readable on the page.
  let accent: RGB | null = null;
  let bestScore = 0;
  for (const { c, w } of clusters) {
    let cand = c;
    // Lift or deepen a nearly-right colour until it reads.
    for (let step = 0; step < 6 && contrast(cand, bg) < 3; step++) cand = mix(cand, dark ? [255, 255, 255] : [0, 0, 0], 0.18);
    if (contrast(cand, bg) < 3) continue;
    const score = sat(cand) * Math.sqrt(w) * (0.6 + 0.4 * Math.min(1, contrast(cand, bg) / 6));
    if (sat(cand) > 0.28 && score > bestScore) {
      bestScore = score;
      accent = cand;
    }
  }
  return { bg: toHex(bg), ink: toHex(ink), accent: toHex(accent ?? (dark ? [255, 106, 43] : [214, 60, 0])), dark };
}
