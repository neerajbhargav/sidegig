// Collecting wallpapers for a collection: fetch from the sources, mix, cache in
// local storage, refresh on a schedule. Works from the new tab and from the
// background worker. Requests are signed out and only carry the search words.
import { getLocal, setLocal } from './storage.ts';
import { ext } from './api.ts';
import { PACKS, bingUrl, fitScore, mixPool, nasaUrl, parseBing, parseNasa, parseWallhaven, rankScore, wallhavenUrl, type Collection, type WallItem } from './walls.ts';

export interface Pool {
  items: WallItem[];
  at: number;
  /** Which results page we asked for last; moves on each refresh so the pool keeps changing. */
  page: number;
}

const KEY = (id: string) => `ntCol:${id}`;
/** Pools older than this refresh on their own. */
export const REFRESH_MS = 24 * 3_600_000;
const inflight = new Map<string, Promise<Pool>>();

export function findCollection(id: string, custom: Collection[] = []): Collection | null {
  return PACKS.find((p) => p.id === id) ?? custom.find((c) => c.id === id) ?? null;
}

async function getJson(url: string, ms = 12_000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { credentials: 'omit', signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function readPool(id: string): Promise<Pool | null> {
  if (id.startsWith('album:')) return albumPool(id);
  return getLocal<Pool | null>(KEY(id), null);
}

// ------------------------------------------------------------ albums
// Collections made from your own pictures. The index is small; each picture is
// stored under its own key so a new tab only reads the one it shows.

export interface AlbumImage {
  id: string;
  w: number;
  h: number;
  name?: string;
}
export interface Album {
  id: string;
  name: string;
  created: number;
  items: AlbumImage[];
}
export const IMG_KEY = (id: string) => `ntImg:${id}`;

export async function listAlbums(): Promise<Album[]> {
  return getLocal<Album[]>('ntAlbums', []);
}

export async function saveAlbum(name: string, images: { url: string; w: number; h: number; name?: string }[]): Promise<Album> {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mine';
  const albums = await listAlbums();
  let id = `album:${slug}`;
  for (let n = 2; albums.some((a) => a.id === id); n++) id = `album:${slug}-${n}`;
  const items: AlbumImage[] = [];
  const writes: Record<string, string> = {};
  images.forEach((im, i) => {
    const imgId = `${id.slice(6)}-${Date.now().toString(36)}-${i}`;
    writes[IMG_KEY(imgId)] = im.url;
    items.push({ id: imgId, w: im.w, h: im.h, name: im.name });
  });
  const album: Album = { id, name: name.trim().slice(0, 40) || 'My pictures', created: Date.now(), items };
  await ext.storage.local.set({ ...writes, ntAlbums: [...albums, album] });
  return album;
}

export async function removeAlbum(id: string): Promise<void> {
  const albums = await listAlbums();
  const a = albums.find((x) => x.id === id);
  if (!a) return;
  await ext.storage.local.remove(a.items.map((im) => IMG_KEY(im.id)));
  await setLocal('ntAlbums', albums.filter((x) => x.id !== id));
}

export async function albumImage(imgId: string): Promise<string> {
  return getLocal<string>(IMG_KEY(imgId), '');
}

async function albumPool(id: string): Promise<Pool | null> {
  const a = (await listAlbums()).find((x) => x.id === id);
  if (!a?.items.length) return null;
  return {
    at: a.created,
    page: 1,
    items: a.items.map((im) => ({ id: `al:${im.id}`, src: `local:${im.id}`, thumb: `local:${im.id}`, w: im.w, h: im.h, link: '', credit: 'your pictures', term: a.name, pop: 1, score: 1 })),
  };
}

export async function hiddenWalls(): Promise<string[]> {
  return getLocal<string[]>('ntWallHidden', []);
}

/** A small thumbnail to judge fit from. */
function sampleUrl(it: WallItem): string {
  const m = it.id.match(/^wh:(.+)$/);
  return m ? `https://th.wallhaven.cc/small/${m[1].slice(0, 2)}/${m[1]}.jpg` : it.thumb;
}

/**
 * Judge how each picture sits behind the new tab (see fitScore), from a
 * 120×75 sample of its thumbnail. Results are cached per picture.
 */
async function measureFit(items: WallItem[]): Promise<WallItem[]> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return items;
  const cache = await getLocal<Record<string, number>>('ntFit', {});
  const todo = items.filter((it) => cache[it.id] === undefined);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const it = todo[next++];
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        const blob = await (await fetch(sampleUrl(it), { credentials: 'omit', signal: ac.signal })).blob();
        clearTimeout(t);
        const bmp = await createImageBitmap(blob);
        const W = 120;
        const H = 75;
        const c = new OffscreenCanvas(W, H);
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(bmp, 0, 0, W, H);
        cache[it.id] = Math.round(fitScore(x.getImageData(0, 0, W, H).data, W, H) * 1000) / 1000;
      } catch {
        /* unmeasured: ranks on popularity alone */
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const keys = Object.keys(cache);
  if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete cache[k];
  await setLocal('ntFit', cache);
  return items.map((it) => (cache[it.id] === undefined ? it : { ...it, fit: cache[it.id], score: rankScore(it.pop, cache[it.id]) }));
}

/** Fetch fresh results for a collection. Keeps the old pool if every source fails. */
export function refreshPool(c: Collection): Promise<Pool> {
  // Your own pictures: nothing to fetch.
  if (c.album || c.id.startsWith('album:')) return albumPool(c.id).then((p) => p ?? Promise.reject(new Error('Empty album')));
  const running = inflight.get(c.id);
  if (running) return running;
  const job = (async () => {
    const old = await readPool(c.id);
    // Rotate through the first three result pages so a refresh brings new pictures.
    const page = old ? (old.page % 3) + 1 : 1;
    const sources = c.sources ?? ['wallhaven'];
    const tasks: Promise<WallItem[]>[] = [];
    for (const term of c.terms.slice(0, 6)) {
      if (sources.includes('wallhaven')) tasks.push(getJson(wallhavenUrl(term, c, page)).then((j) => parseWallhaven(j as never, term)));
      if (sources.includes('nasa')) tasks.push(getJson(nasaUrl(term)).then((j) => parseNasa(j as never, term)));
    }
    if (sources.includes('bing')) tasks.push(Promise.all([getJson(bingUrl(0)), getJson(bingUrl(8))]).then(([a, b]) => [...parseBing(a as never), ...parseBing(b as never)]));
    const settled = await Promise.allSettled(tasks);
    const lists = settled.filter((r): r is PromiseFulfilledResult<WallItem[]> => r.status === 'fulfilled').map((r) => r.value);
    // Judge fit for the strongest candidates of each search, then rank. The best
    // of the previous pool stay in the running, so favourites survive a refresh.
    const fresh = await measureFit(lists.flatMap((l) => [...l].sort((a, b) => b.score - a.score).slice(0, 30)));
    const keep = old ? [...old.items].sort((a, b) => b.score - a.score).slice(0, Math.ceil(old.items.length / 2)) : [];
    const items = mixPool([fresh, keep], await hiddenWalls());
    if (!items.length) {
      if (old) return old;
      throw new Error('No wallpapers found');
    }
    const pool: Pool = { items, at: Date.now(), page };
    await setLocal(KEY(c.id), pool);
    return pool;
  })().finally(() => inflight.delete(c.id));
  inflight.set(c.id, job);
  return job;
}

/** The cached pool, refreshed in the background when it's stale (or fetched now if there's none). */
export async function getPool(c: Collection): Promise<Pool | null> {
  if (c.album || c.id.startsWith('album:')) return albumPool(c.id);
  const pool = await readPool(c.id);
  if (!pool?.items.length) return refreshPool(c).catch(() => null);
  if (Date.now() - pool.at > REFRESH_MS) void refreshPool(c).catch(() => undefined);
  return pool;
}

/** Never show this one again (across every collection). */
export async function hideWall(id: string, collectionId?: string): Promise<void> {
  const hidden = await hiddenWalls();
  if (!hidden.includes(id)) await setLocal('ntWallHidden', [...hidden, id].slice(-500));
  if (!collectionId) return;
  const pool = await readPool(collectionId);
  if (pool) await setLocal(KEY(collectionId), { ...pool, items: pool.items.filter((it) => it.id !== id) });
}
