// Setups: save, carry to another browser, apply only the parts you pick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, appFromCatalog } from '../src/shared/defaults.ts';
import { applySetup, describe, makeSetup, parseSetup, toBundle, toCode, fileName, PARTS } from '../src/shared/setups.ts';

const mine = () => {
  const s = defaultSettings();
  s.apps = [appFromCatalog('claude'), appFromCatalog('gmail'), appFromCatalog('x')];
  s.newtab.look = 'night';
  s.newtab.title = 'Neeraj’s desk';
  s.rail.side = 'right';
  s.edition.size = 9;
  return s;
};
const local = { edProfile: { interests: [{ t: 'agent evals' }, { t: 'porsche 911' }] }, edSaved: [{ id: 'a' }], ntTodos: [{ id: 't1', text: 'Gym' }], ntUploads: [{ id: 'u1', url: 'data:image/jpeg;base64,AAAA' }], workspaces: [] };

test('a setup carries settings and only the local data for its parts', () => {
  const b = makeSetup('  Work  ', mine(), local, ['apps', 'looks', 'reading', 'todos'], 'Chrome');
  assert.equal(b.name, 'Work');
  assert.equal(b.from, 'Chrome');
  assert.ok(b.local.edProfile && b.local.ntTodos);
  assert.equal(b.local.ntUploads, undefined, 'pictures not chosen');
  assert.equal(describe(b), '3 apps, Night theme, 2 interests, 1 to-do');
  assert.equal(fileName(b), 'sidegig-work.json');
});

test('applying picks parts: looks only leaves apps and rail alone', () => {
  const b = makeSetup('Home', mine(), local, ['apps', 'looks', 'reading', 'todos']);
  const current = defaultSettings();
  const { settings, local: writes } = applySetup(current, b, ['looks']);
  assert.equal(settings.newtab.look, 'night');
  assert.equal(settings.newtab.title, 'Neeraj’s desk');
  assert.equal(settings.rail.side, current.rail.side, 'rail untouched');
  assert.deepEqual(settings.apps, current.apps, 'apps untouched');
  assert.deepEqual(Object.keys(writes), [], 'no local data for looks here');
  const all = applySetup(current, b, ['apps', 'looks', 'reading', 'todos', 'pictures']);
  assert.equal(all.settings.rail.side, 'right');
  assert.deepEqual(all.settings.apps.map((a) => a.id), ['claude', 'gmail', 'x']);
  assert.equal(all.settings.edition.size, 9);
  assert.deepEqual(all.local.ntTodos, local.ntTodos);
  assert.equal(all.local.ntUploads, undefined, 'a part the setup never had is skipped');
});

test('codes round-trip, are compact, and never carry pictures', async () => {
  const b = makeSetup('Everything', mine(), local, ['apps', 'looks', 'reading', 'todos', 'pictures']);
  const code = await toCode(b);
  assert.match(code, /^sidegig1:[A-Za-z0-9_-]+$/);
  assert.ok(code.length < JSON.stringify(b).length, 'compressed');
  const back = await parseSetup(`\n  ${code}  \n`);
  assert.equal(back.name, 'Everything');
  assert.deepEqual(back.settings.apps.map((a) => a.id), ['claude', 'gmail', 'x']);
  assert.ok(!back.parts.includes('pictures'));
  assert.equal(back.local.ntUploads, undefined);
  await assert.rejects(parseSetup(code.slice(0, 40)), /incomplete/);
});

test('files: new setup files and old settings exports both import; junk is refused', async () => {
  const b = makeSetup('File', mine(), local, ['apps', 'looks']);
  const fromFile = await parseSetup(JSON.stringify(b, null, 2));
  assert.equal(fromFile.name, 'File');
  // An export from the old Backup button: just the settings object.
  const legacy = await parseSetup(JSON.stringify(mine()), 'sidegig-settings');
  assert.equal(legacy.name, 'sidegig-settings');
  assert.deepEqual(legacy.parts, ['apps', 'looks', 'reading']);
  const applied = applySetup(defaultSettings(), legacy, ['apps']);
  assert.deepEqual(applied.settings.apps.map((a) => a.id), ['claude', 'gmail', 'x']);
  await assert.rejects(parseSetup('hello'), /Not a sidegig setup/);
  await assert.rejects(parseSetup('{"foo":1}'), /Not a sidegig setup/);
  assert.throws(() => toBundle({ kind: 'sidegig-setup', format: 2, settings: {} }), /newer sidegig/);
});

test('partial imported settings can be described before applying them', async () => {
  for (const settings of [{ version: 10, newtab: { name: 'Sam' } }, { version: 10, newtab: { look: '' } }]) {
    const legacy = await parseSetup(JSON.stringify(settings));
    assert.match(describe(legacy), /Match browser theme/);
    const bundle = toBundle({ kind: 'sidegig-setup', format: 1, settings, parts: ['looks'] });
    assert.equal(describe(bundle), 'Match browser theme');
    assert.deepEqual(bundle.settings, settings, 'describing does not change the imported file');
  }
});

test('a code with no portable parts does not acquire apps or overwrite them', async () => {
  const b = makeSetup('Pictures only', mine(), local, ['pictures']);
  const back = await parseSetup(await toCode(b));
  assert.deepEqual(back.parts, []);
  const current = defaultSettings();
  assert.deepEqual(applySetup(current, back, PARTS.map((p) => p.id)).settings, current);
});

test('an old setup is migrated when applied (Gmail opens in the sidebar)', () => {
  const old = mine();
  old.version = 5;
  old.apps = old.apps.map((a) => ({ ...a, openIn: 'panel' }));
  const b = toBundle({ kind: 'sidegig-setup', format: 1, name: 'Old', parts: ['apps'], settings: old, local: {} });
  const { settings } = applySetup(defaultSettings(), b, ['apps']);
  assert.equal(settings.apps.find((a) => a.id === 'gmail')?.openIn, 'panel');
  assert.equal(settings.apps.find((a) => a.id === 'gmail')?.mobile, false);
  assert.equal(settings.apps.find((a) => a.id === 'claude')?.openIn, 'panel');
});

test('pictures include your albums and every album image, and codes leave them out', async () => {
  const withAlbum = { ...local, ntAlbums: [{ id: 'album:ns', name: 'NS', created: 1, items: [{ id: 'ns-1', w: 2560, h: 1440 }] }], 'ntImg:ns-1': 'data:image/jpeg;base64,BBBB', unrelated: 1 };
  const b = makeSetup('NS', mine(), withAlbum, ['looks', 'pictures']);
  assert.ok(b.local.ntAlbums && b.local['ntImg:ns-1'] && b.local.ntUploads);
  assert.equal(b.local.unrelated, undefined);
  const { local: writes } = applySetup(defaultSettings(), b, ['pictures']);
  assert.equal(writes['ntImg:ns-1'], 'data:image/jpeg;base64,BBBB');
  const back = await parseSetup(await toCode(b));
  assert.equal(back.local['ntImg:ns-1'], undefined);
  assert.equal(back.local.ntAlbums, undefined);
});
