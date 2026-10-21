// Automatic backup (opt-in, Settings > Setups): once a week, a setup file in
// your Downloads folder, sidegig/sidegig-backup.json, replaced each time. The
// browser deletes an extension's storage when it is removed; this file survives
// that, and Settings > Setups > Import file applies it again. Like every setup
// it never holds API keys, passwords or connection tokens, and it leaves out
// uploaded pictures to stay small.
import { ext } from '../shared/api.ts';
import { loadSettings, getLocal, setLocal } from '../shared/storage.ts';
import { makeSetup, MAX_SETUP_BYTES, type SetupPart } from '../shared/setups.ts';

export const BACKUP_FILE = 'sidegig/sidegig-backup.json';
const WEEK_MIN = 7 * 24 * 60;

const bytesOf = (s: string) => new TextEncoder().encode(s).length;

/**
 * The backup's contents: everything a setup carries except pictures; chats only
 * while it fits the importer's limit (counted in bytes, as the importer does).
 * Null when even without chats it would not fit.
 */
export function backupJson(settings: Parameters<typeof makeSetup>[1], local: Record<string, unknown>, at: number): string | null {
  const parts: SetupPart[] = ['apps', 'looks', 'reading', 'todos', 'notes', 'chats'];
  const build = (p: SetupPart[]) => JSON.stringify({ ...makeSetup('Automatic backup', settings, local, p, 'automatic backup'), created: at }, null, 2);
  for (const json of [build(parts), build(parts.filter((p) => p !== 'chats'))]) if (bytesOf(json) <= MAX_SETUP_BYTES) return json;
  return null;
}

/** Wait until the browser has finished (or given up on) a download. */
function settled(dl: any, id: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => (dl.onChanged.removeListener(watch), clearTimeout(timer), resolve(ok));
    const watch = (d: { id: number; state?: { current?: string } }) => {
      if (d.id !== id || !d.state?.current) return;
      if (d.state.current === 'complete') done(true);
      else if (d.state.current === 'interrupted') done(false);
    };
    dl.onChanged.addListener(watch);
    const timer = setTimeout(() => done(false), 60_000);
    // It may have finished before the listener was added.
    void dl.search({ id }).then((r: { state?: string }[]) => r[0]?.state === 'complete' ? done(true) : r[0]?.state === 'interrupted' ? done(false) : undefined);
  });
}

const base64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Write the backup now. False when the browser hasn't granted downloads. */
export async function backupNow(): Promise<boolean> {
  const dl = (ext as any).downloads;
  if (!dl?.download) return false;
  const json = backupJson(await loadSettings(), await ext.storage.local.get(null), Date.now());
  if (!json) return false;
  // Workers have no object URLs; a data URL works there, a blob URL in Firefox's background page.
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([json], { type: 'application/json' })) : `data:application/json;base64,${base64(json)}`;
  const id: number = await dl.download({ url, filename: BACKUP_FILE, conflictAction: 'overwrite', saveAs: false });
  // Only a finished file counts as a backup.
  if (!(await settled(dl, id))) return false;
  await setLocal('backupAt', Date.now());
  return true;
}

/** Keep the weekly alarm in step with the switch. */
export async function scheduleBackup(): Promise<void> {
  if (await getLocal<boolean>('autoBackup', false)) {
    if (!(await ext.alarms.get('backup'))) ext.alarms.create('backup', { periodInMinutes: WEEK_MIN, delayInMinutes: 1 });
  } else await ext.alarms.clear('backup');
}
