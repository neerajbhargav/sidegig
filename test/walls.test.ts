// Wallpaper collections: parsing real responses, ranking by popularity and
// fit, mixing, rotation and the picture palette.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PACKS,
  MIN_FIT,
  collectionFromKeywords,
  contrast,
  fitScore,
  mixPool,
  paletteFromPixels,
  parseBing,
  parseNasa,
  parseWallhaven,
  pickIndex,
  popularity,
  rankScore,
  wallhavenUrl,
  type WallItem,
} from '../src/shared/walls.ts';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/walls/${name}`, import.meta.url), 'utf8'));
const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

test('wallhaven search asks for loved, safe, screen-shaped, sharp pictures without text or collages', () => {
  const u = new URL(wallhavenUrl('porsche 911', {}));
  assert.equal(u.searchParams.get('purity'), '100');
  assert.equal(u.searchParams.get('sorting'), 'favorites');
  assert.equal(u.searchParams.get('atleast'), '2560x1440');
  assert.match(u.searchParams.get('q')!, /^porsche 911 .*-text.*-collage/);
  assert.equal(u.searchParams.get('categories'), '100');
  assert.equal(new URL(wallhavenUrl('naruto', { animeOnly: true })).searchParams.get('categories'), '010');
  assert.equal(new URL(wallhavenUrl('x', { anime: true }, 3)).searchParams.get('page'), '3');
});

test('parseWallhaven keeps only well-loved landscape pictures and scores them', () => {
  const raw = fx('wallhaven-porsche.json');
  const items = parseWallhaven(raw, 'porsche 911');
  assert.ok(items.length >= 10, `kept ${items.length}`);
  const top = Math.max(...raw.data.map((d: { favorites: number }) => d.favorites));
  for (const it of items) {
    assert.match(it.id, /^wh:/);
    assert.match(it.src, /^https:\/\/w\.wallhaven\.cc\/full\//);
    assert.ok(it.w >= it.h * 1.3);
    assert.ok(it.pop > 0 && it.pop <= 1);
    assert.equal(it.term, 'porsche 911');
    const d = raw.data.find((x: { id: string }) => `wh:${x.id}` === it.id);
    assert.ok(d.favorites >= Math.max(15, top * 0.12));
  }
  // More favourites, higher popularity.
  const sorted = [...items].sort((a, b) => b.pop - a.pop);
  assert.ok(sorted[0].pop >= sorted[sorted.length - 1].pop);
  const anime = parseWallhaven(fx('wallhaven-anime.json'), 'anime landscape');
  assert.ok(anime.length >= 10);
});

test('popularity grows with favourites and like rate, and caps at 1', () => {
  assert.ok(popularity(1000, 100000) > popularity(100, 100000));
  assert.ok(popularity(100, 5000) > popularity(100, 50000));
  assert.ok(popularity(1e7, 1e7) <= 1);
  assert.equal(popularity(0, 0), 0);
  assert.ok(rankScore(0.8, 0.9) > rankScore(0.8, 0.2));
});

test('parseNasa builds full-size public-domain links and skips diagrams', () => {
  const items = parseNasa(fx('nasa-nebula.json'), 'nebula');
  assert.ok(items.length >= 20);
  for (const it of items) {
    assert.match(it.src, /^https:\/\/images-assets\.nasa\.gov\/image\/.+~large\.jpg$/);
    assert.match(it.link, /^https:\/\/images\.nasa\.gov\/details\//);
    assert.equal(it.credit, 'NASA');
    assert.doesNotMatch(it.title ?? '', /diagram|chart|infographic/i);
  }
});

test('parseBing gives UHD photos of the day with their credit', () => {
  const items = parseBing(fx('bing.json'));
  assert.ok(items.length >= 6);
  assert.match(items[0].src, /^https:\/\/www\.bing\.com\/th\?id=OHR\..+_UHD\.jpg$/);
  assert.ok(items[0].credit.length > 5);
  assert.ok(items[0].pop > 0.7);
});

const item = (id: string, term: string, score: number, extra: Partial<WallItem> = {}): WallItem => ({ id, src: `https://x/${id}.jpg`, thumb: '', w: 3840, h: 2160, link: '', credit: 'x', term, pop: score, score, ...extra });

test('mixPool alternates search terms, best first, without duplicates, hidden or poor fits', () => {
  const a = [item('a1', 'cars', 0.9), item('a2', 'cars', 0.8), item('a3', 'cars', 0.7)];
  const b = [item('b1', 'jdm', 0.5), item('b2', 'jdm', 0.95)];
  const pool = mixPool([a, b, [item('a1', 'cars', 0.9)]], ['a3']);
  assert.deepEqual(
    pool.map((p) => p.id),
    ['a1', 'b2', 'a2', 'b1'],
  );
  // Same size and palette = the same picture uploaded twice.
  const dupes = mixPool([[item('x1', 't', 0.9, { colors: ['#000000', '#ffffff'] }), item('x2', 't', 0.8, { colors: ['#000000', '#ffffff'] })]]);
  assert.equal(dupes.length, 1);
  const fits = mixPool([[item('f1', 't', 0.9, { fit: MIN_FIT - 0.01 }), item('f2', 't', 0.5, { fit: 0.8 })]]);
  assert.deepEqual(
    fits.map((p) => p.id),
    ['f2'],
  );
  assert.equal(mixPool([Array.from({ length: 100 }, (_, i) => item(`n${i}`, 't', i / 100))], [], 10).length, 10);
});

test('pickIndex: every tab steps on, hourly and daily hold still, next skips', () => {
  const t = Date.UTC(2026, 9, 13, 15, 30);
  assert.equal(pickIndex(10, 'tab', t, { i: 3, skip: 0 }), 3);
  assert.equal(pickIndex(10, 'tab', t, { i: 3, skip: 2 }), 5);
  assert.equal(pickIndex(10, 'day', t, { i: 0, skip: 0 }), pickIndex(10, 'day', t + 60_000, { i: 99, skip: 0 }));
  assert.equal(pickIndex(10, 'hour', t, { i: 0, skip: 1 }), (pickIndex(10, 'hour', t, { i: 0, skip: 0 }) + 1) % 10);
  assert.notEqual(pickIndex(24, 'hour', t, { i: 0, skip: 0 }), pickIndex(24, 'hour', t + 3_600_000, { i: 0, skip: 0 }));
  assert.equal(pickIndex(0, 'tab', t, { i: 0, skip: 0 }), -1);
  assert.equal(pickIndex(5, 'tab', t, { i: 0, skip: -1 }), 4);
});

test('collectionFromKeywords turns a typed line into a collection', () => {
  const c = collectionFromKeywords('Porsche 911,  nismo GT-R ; porsche 911');
  assert.ok(c);
  assert.deepEqual(c!.terms, ['porsche 911', 'nismo gt-r']);
  assert.equal(c!.name, 'Porsche 911 + Nismo Gt-R');
  assert.match(c!.id, /^k:/);
  assert.equal(collectionFromKeywords('  ,  '), null);
  assert.equal(collectionFromKeywords('naruto')!.name, 'Naruto');
});

test('every pack has a name, search terms and a note', () => {
  assert.ok(PACKS.length >= 8);
  const ids = new Set(PACKS.map((p) => p.id));
  assert.equal(ids.size, PACKS.length);
  for (const p of PACKS) {
    assert.ok(p.name && p.note && p.terms.length >= 2, p.id);
  }
  assert.ok(PACKS.find((p) => p.id === 'anime')?.animeOnly);
  assert.ok(PACKS.find((p) => p.id === 'cars'));
});

/** RGBA pixels from a function of (x, y). */
const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    px.set([r, g, b, 255], (y * w + x) * 4);
  }
  return px;
};

test('fitScore: calm colourful pictures beat clutter and flat black', () => {
  const W = 120;
  const H = 75;
  // A sunset gradient: smooth and colourful.
  const sunset = fitScore(img(W, H, (x, y) => [230 - y, 120 + x / 3, 60 + y]), W, H);
  // Static noise: a collage-like mess.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 255;
  const noise = fitScore(img(W, H, () => [rnd(), rnd(), rnd()]), W, H);
  const black = fitScore(img(W, H, () => [6, 6, 8]), W, H);
  // Subject on the right, calm on the left (where the clock sits).
  const rightSubject = fitScore(img(W, H, (x, y) => (x > W * 0.55 && (x + y) % 6 < 3 ? [240, 80, 40] : [40, 50, 70])), W, H);
  const leftSubject = fitScore(img(W, H, (x, y) => (x < W * 0.45 && (x + y) % 6 < 3 ? [240, 80, 40] : [40, 50, 70])), W, H);
  assert.ok(sunset > 0.6, `sunset ${sunset}`);
  assert.ok(noise < MIN_FIT, `noise ${noise}`);
  assert.ok(black < MIN_FIT, `black ${black}`);
  assert.ok(rightSubject > leftSubject, `${rightSubject} vs ${leftSubject}`);
});

test('paletteFromPixels: a readable theme from a picture', () => {
  // Night city: mostly dark blue with orange lights.
  const night = paletteFromPixels(img(48, 28, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? [255, 140, 40] : [14 + y, 20 + y, 46 + y])));
  assert.equal(night.dark, true);
  assert.ok(contrast(hexRgb(night.ink), hexRgb(night.bg)) >= 7, 'ink reads on page');
  assert.ok(contrast(hexRgb(night.accent), hexRgb(night.bg)) >= 3, 'accent reads on page');
  const [r, , b] = hexRgb(night.accent);
  assert.ok(r > b, `accent picks the warm lights: ${night.accent}`);
  // Bright beach: light page, dark ink.
  const beach = paletteFromPixels(img(48, 28, (_x, y) => (y < 14 ? [150, 205, 240] : [238, 222, 190])));
  assert.equal(beach.dark, false);
  assert.ok(contrast(hexRgb(beach.ink), hexRgb(beach.bg)) >= 7);
  assert.ok(contrast(hexRgb(beach.accent), hexRgb(beach.bg)) >= 3);
  // No pixels: a safe default.
  assert.match(paletteFromPixels(new Uint8ClampedArray(0)).bg, /^#[0-9a-f]{6}$/);
});
