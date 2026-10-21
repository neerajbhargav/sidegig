// Which app icons are still the browser's blank globe? The browser only knows a
// site's icon once you've visited it, so a fresh install shows globes for
// Gemini, WhatsApp and friends. We compare each app's icon with the blank one
// and list the misses; the UI then uses a bundled brand icon instead.
import { ext, faviconFor } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import type { AppEntry } from '../shared/types.ts';
import { PROVIDERS } from '../shared/browserai.ts';
import { measureIcon, type IconFit } from '../shared/iconfit.ts';

/** Measure an icon so every one can be drawn at the same visual size (the rail can't read pixels itself). */
async function fitOf(url: string): Promise<IconFit | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const c = new OffscreenCanvas(64, 64);
    const x = c.getContext('2d')!;
    x.drawImage(bmp, 0, 0, 64, 64);
    return measureIcon(x.getImageData(0, 0, 64, 64).data, 64, 64);
  } catch {
    return null;
  }
}

const b64 = (buf: ArrayBuffer) => {
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * When the browser only has a small icon for a site (it upscales blurrily), use
 * the site's own touch icon: requested signed out, kept only if it is large,
 * stored at 128 px. Returns a data URL and its fit, or null.
 */
async function sharperIcon(pageUrl: string): Promise<{ src: string; fit: IconFit } | null> {
  try {
    const cached = await createImageBitmap(await (await fetch(faviconFor(pageUrl, 64))).blob());
    if (cached.width >= 48) return null;
    const r = await fetch(new URL('/apple-touch-icon.png', pageUrl).href, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) return null;
    const bmp = await createImageBitmap(await r.blob());
    if (bmp.width < 96) return null;
    const c = new OffscreenCanvas(128, 128);
    const x = c.getContext('2d')!;
    x.drawImage(bmp, 0, 0, 128, 128);
    const fit = measureIcon(x.getImageData(0, 0, 128, 128).data, 128, 128);
    const png = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
    return { src: `data:image/png;base64,${b64(png)}`, fit };
  } catch {
    return null;
  }
}

async function bytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function checkFavicons(appList: AppEntry[]): Promise<void> {
  if (!ext?.runtime?.getURL) return;
  // The AI switch on the new tab shows providers too.
  const ids = new Set(appList.map((a) => a.id));
  const apps: { id: string; url: string }[] = [...appList, ...Object.values(PROVIDERS).filter((p) => p.home.startsWith('http') && !ids.has(p.id)).map((p) => ({ id: p.id, url: p.home }))];
  const blank = await bytes(faviconFor('https://sidegig-blank.invalid/', 32));
  if (!blank) return;
  const missing: string[] = [];
  const fit: Record<string, IconFit> = {};
  const sharp: Record<string, string> = {};
  await Promise.all(
    apps.map(async (a) => {
      const b = await bytes(faviconFor(a.url, 32));
      if (!b || same(b, blank)) return void missing.push(a.id);
      const better = appList.some((x) => x.id === a.id) ? await sharperIcon(a.url) : null;
      if (better) {
        sharp[a.id] = better.src;
        fit[a.id] = better.fit;
        return;
      }
      const f = await fitOf(faviconFor(a.url, 64));
      if (f) fit[a.id] = f;
    }),
  );
  const prevSharp = await getLocal<Record<string, string>>('sharpIcons', {});
  if (JSON.stringify(prevSharp) !== JSON.stringify(sharp)) await setLocal('sharpIcons', sharp);
  const prev = await getLocal<string[]>('favMissing', []);
  if (prev.slice().sort().join() !== missing.slice().sort().join()) await setLocal('favMissing', missing);
  const prevFit = await getLocal<Record<string, IconFit>>('iconFit', {});
  if (JSON.stringify(prevFit) !== JSON.stringify(fit)) await setLocal('iconFit', fit);
}
