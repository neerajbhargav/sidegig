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

/** The backup's contents: everything a setup carries except pictures; chats only while it stays small. */
export function backupJson(settings: Parameters<typeof makeSetup>[1], local: Record<string, unknown>, at: number): string {
  const parts: SetupPart[] = ['apps', 'looks', 'reading', 'todos', 'notes', 'chats'];
  let json = JSON.stringify({ ...makeSetup('Automatic backup', settings, local, parts, 'automatic backup'), created: at }, null, 2);
  if (json.length > MAX_SETUP_BYTES / 2) json = JSON.stringify({ ...makeSetup('Automatic backup', settings, local, parts.filter((p) => p !== 'chats'), 'automatic backup'), created: at }, null, 2);
  return json;
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
  // Workers have no object URLs; a data URL works there, a blob URL in Firefox's background page.
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([json], { type: 'application/json' })) : `data:application/json;base64,${base64(json)}`;
  await dl.download({ url, filename: BACKUP_FILE, conflictAction: 'overwrite', saveAs: false });
  await setLocal('backupAt', Date.now());
  return true;
}

/** Keep the weekly alarm in step with the switch. */
export async function scheduleBackup(): Promise<void> {
  if (await getLocal<boolean>('autoBackup', false)) {
    if (!(await ext.alarms.get('backup'))) ext.alarms.create('backup', { periodInMinutes: WEEK_MIN, delayInMinutes: 1 });
  } else await ext.alarms.clear('backup');
}
