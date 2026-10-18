import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let synced: Record<string, unknown> = {};
let local: Record<string, unknown> = {};
let syncFails = false;
const listeners = new Set<(...args: any[]) => void>();
const area = (name: 'sync' | 'local') => ({
  async get() { return structuredClone(name === 'sync' ? synced : local); },
  async set(values: Record<string, unknown>) {
    if (name === 'sync' && syncFails) throw new Error('QUOTA_BYTES_PER_ITEM');
    Object.assign(name === 'sync' ? synced : local, structuredClone(values));
  },
});
const storage = { sync: area('sync'), local: area('local'), onChanged: {
  addListener: (fn: (...args: any[]) => void) => listeners.add(fn),
  removeListener: (fn: (...args: any[]) => void) => listeners.delete(fn),
} };
(globalThis as any).chrome = { storage };
const { loadSettings, saveSettings } = await import('../src/shared/storage.ts');
const { defaultSettings } = await import('../src/shared/defaults.ts');

beforeEach(() => { synced = {}; local = {}; syncFails = false; });

test('a save that exceeds sync quota survives loading over an older synced copy', async () => {
  const old = defaultSettings();
  old.newtab.name = 'Before';
  synced.settings = old;
  syncFails = true;
  const next = defaultSettings();
  next.newtab.name = 'After';
  next.theme.customCss = 'body { color: red; }';
  await saveSettings(next);
  const loaded = await loadSettings();
  assert.equal(loaded.newtab.name, 'After');
  assert.equal(loaded.theme.customCss, next.theme.customCss);
  assert.equal((synced.settings as typeof old).newtab.name, 'Before');
  assert.equal((local.settings as typeof old).theme.customCss, '', 'CSS stays in its device-local key');
});

test('a newer remote save beats the local fallback, without replacing local CSS', async () => {
  syncFails = true;
  const next = defaultSettings();
  next.newtab.name = 'Local';
  next.theme.customCss = 'body { color: red; }';
  await saveSettings(next);
  const remote = defaultSettings();
  remote.newtab.name = 'Remote';
  synced = { settings: { ...remote, savedAt: Number((local.settings as { savedAt: number }).savedAt) + 1 } };
  const loaded = await loadSettings();
  assert.equal(loaded.newtab.name, 'Remote');
  assert.equal(loaded.theme.customCss, next.theme.customCss);
});

test('sync recovery stores the latest settings and an equal local backup', async () => {
  syncFails = true;
  const next = defaultSettings();
  next.newtab.name = 'Fallback';
  await saveSettings(next);
  syncFails = false;
  next.newtab.name = 'Recovered';
  await saveSettings(next);
  assert.equal((await loadSettings()).newtab.name, 'Recovered');
  assert.deepEqual(synced.settings, local.settings);
  assert.equal((synced.settings as typeof next).theme.customCss, '');
  assert.equal(synced.customCss, undefined);
});

test('legacy settings keep sync precedence and load a local-only fallback', async () => {
  const old = defaultSettings();
  old.newtab.name = 'Synced';
  synced.settings = old;
  local.settings = { ...old, newtab: { ...old.newtab, name: 'Local' } };
  assert.equal((await loadSettings()).newtab.name, 'Synced');
  delete synced.settings;
  assert.equal((await loadSettings()).newtab.name, 'Local');
});

test('settings still save when the browser has no sync storage', async () => {
  const sync = storage.sync;
  delete (storage as Partial<typeof storage>).sync;
  try {
    const next = defaultSettings();
    next.newtab.name = 'Device only';
    await saveSettings(next);
    assert.equal((await loadSettings()).newtab.name, 'Device only');
  } finally { storage.sync = sync; }
});

test('a save follows the newest timestamp already observed, even if the clock is behind', async () => {
  synced = { settings: { ...defaultSettings(), savedAt: Date.now() + 60_000 } };
  await loadSettings();
  const before = (synced.settings as { savedAt: number }).savedAt;
  syncFails = true;
  const next = defaultSettings();
  next.newtab.name = 'Later edit';
  await saveSettings(next);
  assert.ok((local.settings as { savedAt: number }).savedAt > before);
  assert.equal((await loadSettings()).newtab.name, 'Later edit');
});

test('rapid independent settings updates keep both changes', async () => {
  const { updateSettings } = await import('../src/shared/storage.ts');
  await Promise.all([
    updateSettings((s) => { s.rail.side = 'right'; }),
    updateSettings((s) => { s.newtab.title = 'My desk'; }),
  ]);
  const s = await loadSettings();
  assert.equal(s.rail.side, 'right');
  assert.equal(s.newtab.title, 'My desk');
});

test('local and sync echoes notify a settings subscriber only once', async () => {
  const { onSettingsChanged } = await import('../src/shared/storage.ts');
  let calls = 0;
  const stop = onSettingsChanged(() => { calls++; });
  try {
    await saveSettings(defaultSettings());
    for (const event of ['local', 'sync']) for (const listener of listeners) listener({ settings: {} }, event);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1);
    for (const listener of listeners) listener({ settings: {} }, 'sync');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1, 'unchanged settings do not redraw the page');
  } finally { stop(); }
});
