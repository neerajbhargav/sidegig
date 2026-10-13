// Which app icons are still the browser's blank globe? The browser only knows a
// site's icon once you've visited it, so a fresh install shows globes for
// Gemini, WhatsApp and friends. We compare each app's icon with the blank one
// and list the misses; the UI then uses a bundled brand icon instead.
import { ext, faviconFor } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import type { AppEntry } from '../shared/types.ts';
import { PROVIDERS } from '../shared/browserai.ts';

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
  await Promise.all(
    apps.map(async (a) => {
      const b = await bytes(faviconFor(a.url, 32));
      if (!b || same(b, blank)) missing.push(a.id);
    }),
  );
  const prev = await getLocal<string[]>('favMissing', []);
  if (prev.slice().sort().join() !== missing.slice().sort().join()) await setLocal('favMissing', missing);
}
