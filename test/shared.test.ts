import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, rank } from '../src/shared/fuzzy.ts';
import { parseBadge, badgeLabel } from '../src/shared/badge.ts';
import { matchPattern, findRule, hostExcluded } from '../src/shared/rules.ts';
import { buildPrompt, cleanText, truncate } from '../src/shared/prompt.ts';
import { mergeSettings, migrate } from '../src/shared/storage.ts';
import { defaultSettings, appFromCatalog, SETTINGS_VERSION } from '../src/shared/defaults.ts';
import { CATALOG } from '../src/shared/catalog.ts';

test('fuzzy: exact words beat scattered letters', () => {
  const exact = fuzzyScore('git', 'GitHub notifications')!;
  const scattered = fuzzyScore('git', 'Google Instagram Twitter')!;
  assert.ok(exact > scattered);
  assert.equal(fuzzyScore('xyz', 'GitHub'), null);
  assert.equal(fuzzyScore('', 'anything'), 0);
});

test('fuzzy: multi-word queries need every word', () => {
  assert.ok(fuzzyScore('jersey apt', 'Jersey City apartments') !== null);
  assert.equal(fuzzyScore('jersey boston', 'Jersey City apartments'), null);
});

test('rank orders by weighted best field', () => {
  const items = [
    { title: 'Vercel dashboard', url: 'https://vercel.com' },
    { title: 'Splitter', url: 'https://usesplitter.vercel.app' },
    { title: 'Random', url: 'https://example.com' },
  ];
  const r = rank(items, 'vercel', (i) => [[i.title, 1], [i.url, 0.6]]);
  assert.equal(r.length, 2);
  assert.equal(r[0].item.title, 'Vercel dashboard');
});

test('badges from page titles', () => {
  assert.deepEqual(parseBadge('(3) WhatsApp', 'parens'), { count: 3 });
  assert.deepEqual(parseBadge('[12] Telegram', 'parens'), { count: 12 });
  assert.deepEqual(parseBadge('(99+) X', 'parens'), { count: 99 });
  assert.deepEqual(parseBadge('WhatsApp', 'parens'), { count: 0 });
  assert.deepEqual(parseBadge('* Slack | general', 'parens'), { count: -1 });
  assert.deepEqual(parseBadge('! Slack | dm', 'parens'), { count: 1 });
  assert.deepEqual(parseBadge('Inbox (1,204) - me@gmail.com - Gmail', 'gmail'), { count: 1204 });
  assert.deepEqual(parseBadge('Inbox - me@gmail.com - Gmail', 'gmail'), { count: 0 });
  assert.equal(parseBadge('(3) WhatsApp', 'none'), null);
  assert.equal(badgeLabel(150), '99+');
  assert.equal(badgeLabel(-1), '');
});

test('link rule patterns', () => {
  assert.ok(matchPattern('notion.so', 'https://www.notion.so/page'));
  assert.ok(matchPattern('*.figma.com', 'https://www.figma.com/file/1'));
  assert.ok(matchPattern('*.figma.com', 'https://figma.com/'));
  assert.ok(!matchPattern('notion.so', 'https://notnotion.so/'));
  assert.ok(matchPattern('github.com/landairnyc', 'https://github.com/LandairNYC/repo'));
  assert.ok(!matchPattern('github.com/landairnyc', 'https://github.com/other'));
  assert.ok(!matchPattern('notion.so', 'chrome://settings'));
  const rules = [
    { id: '1', pattern: 'notion.so', action: 'window' as const, enabled: false },
    { id: '2', pattern: 'notion.so', action: 'reuse-tab' as const, enabled: true },
  ];
  assert.equal(findRule(rules, 'https://notion.so/x')?.id, '2');
  assert.ok(hostExcluded(['docs.google.com'], 'docs.google.com'));
  assert.ok(hostExcluded(['google.com'], 'docs.google.com'));
  assert.ok(!hostExcluded(['docs.google.com'], 'mail.google.com'));
});

test('prompt building cleans, truncates and fills tokens', () => {
  assert.equal(cleanText('  Menu \n\nMenu\nBody   text\n'), 'Menu\nBody text');
  const long = 'Sentence one. '.repeat(200);
  const t = truncate(long, 300);
  assert.ok(t.length <= 300 && t.endsWith('[truncated]'));
  const p = buildPrompt({ template: '{text}\n\nSource: {title}\n{url}', text: 'Hello', title: ' Page ', url: 'https://a.b', maxChars: 100 });
  assert.equal(p, 'Hello\n\nSource: Page\nhttps://a.b');
});

test('settings merge keeps defaults for missing or mistyped values', () => {
  const d = defaultSettings();
  const merged = mergeSettings(d, {
    rail: { side: 'right', hotZone: 'wide', junk: true },
    apps: [appFromCatalog('notion')],
    unknown: 1,
  });
  assert.equal(merged.rail.side, 'right');
  assert.equal(merged.rail.hotZone, d.rail.hotZone);
  assert.equal((merged.rail as any).junk, undefined);
  assert.equal(merged.apps.length, 1);
  assert.equal((merged as any).unknown, undefined);
  assert.deepEqual(mergeSettings(d, null), d);
  assert.equal((migrate({}) as any).version, SETTINGS_VERSION);
});

test('catalog is well formed', () => {
  const ids = new Set<string>();
  for (const a of CATALOG) {
    assert.ok(!ids.has(a.id), `duplicate ${a.id}`);
    ids.add(a.id);
    assert.equal(new URL(a.url).protocol, 'https:');
    if (a.category === 'AI') assert.ok(a.aiInput?.length, `${a.id} needs input selectors`);
  }
  const d = defaultSettings();
  assert.ok(d.apps.length >= 4);
  assert.ok(d.apps.every((a) => ids.has(a.id)));
});

test('settings v4: the old wallpaper choice becomes a background', () => {
  const m = mergeSettings(defaultSettings(), migrate({ version: 3, newtab: { wallpaper: 'monuments', look: 'paper' } }));
  assert.equal(m.newtab.background.kind, 'monuments');
  assert.equal(m.newtab.look, 'paper');
  const u = mergeSettings(defaultSettings(), migrate({ version: 3, newtab: { wallpaper: 'custom' } }));
  assert.deepEqual([u.newtab.background.kind, u.newtab.background.ref], ['upload', 'legacy']);
});

test('v5: the new tab has your own name and no decorative tag', () => {
  const fresh = mergeSettings(defaultSettings(), {});
  assert.equal(fresh.newtab.title, '');
  assert.equal(fresh.newtab.tag, '');
  // An old install that saved the "ntp–1" tag loses it; a tag you wrote stays.
  const old = mergeSettings(defaultSettings(), migrate({ version: 4, newtab: { tag: 'ntp–1', title: 'Neeraj’s desk' } }));
  assert.equal(old.newtab.tag, '');
  assert.equal(old.newtab.title, 'Neeraj’s desk');
  const mine = mergeSettings(defaultSettings(), migrate({ version: 4, newtab: { tag: 'home' } }));
  assert.equal(mine.newtab.tag, 'home');
});

test('v6 to v10: Gmail and X end up in the sidebar, X in its phone layout; other apps stay put', () => {
  const m = mergeSettings(
    defaultSettings(),
    migrate({ version: 5, apps: [{ id: 'gmail', catalogId: 'gmail', openIn: 'panel' }, { id: 'x', catalogId: 'x', openIn: 'drawer' }, { id: 'claude', catalogId: 'claude', openIn: 'panel' }, { id: 'mine', openIn: 'panel' }] }),
  );
  assert.deepEqual(
    m.apps.map((a) => `${a.id}:${a.openIn}`),
    ['gmail:panel', 'x:panel', 'claude:panel', 'mine:panel'],
  );
  assert.equal(m.apps.find((a) => a.id === 'x')?.mobile, true);
  assert.equal(m.apps.find((a) => a.id === 'gmail')?.mobile, false);
  assert.equal(m.apps.find((a) => a.id === 'claude')?.mobile ?? false, false);
  assert.equal(appFromCatalog('gmail').openIn, 'panel');
  assert.equal(appFromCatalog('claude').openIn, 'panel');
});

test('v7: the dashboard arrives with every widget on; weather you turned off stays off', () => {
  const fresh = mergeSettings(defaultSettings(), migrate({ version: 6, newtab: { weather: { enabled: false, place: '', lat: 0, lon: 0, units: 'f' } } }));
  assert.equal(fresh.newtab.widgets.weather, true, 'never set up: show the inline city picker');
  assert.equal(fresh.newtab.widgets.calendar, true);
  assert.equal(fresh.newtab.panels, 'clear', 'v8 moves everyone to Clear');
  assert.equal(fresh.newtab.background.inks, 'theme');
  const off = mergeSettings(defaultSettings(), migrate({ version: 6, newtab: { weather: { enabled: false, place: 'Jersey City', lat: 40.7, lon: -74, units: 'f' } } }));
  assert.equal(off.newtab.widgets.weather, false);
  assert.equal(off.newtab.widgets.notes, true);
});

test('v8: everyone moves to Clear once; the auto effect becomes what it showed', () => {
  const night = mergeSettings(defaultSettings(), migrate({ version: 7, newtab: { look: 'night', panels: 'frosted', background: { kind: 'monuments', ref: 'm:3', treatment: 'auto', inks: 'theme', dim: 0, blur: 0 } } }));
  assert.equal(night.newtab.panels, 'clear');
  assert.equal(night.newtab.background.treatment, 'print');
  const pic = mergeSettings(defaultSettings(), migrate({ version: 7, newtab: { look: 'picture', background: { kind: 'collection', ref: 'album:ns', treatment: 'auto', inks: 'theme', dim: 0, blur: 0 } } }));
  assert.equal(pic.newtab.background.treatment, 'photo');
  const film = mergeSettings(defaultSettings(), migrate({ version: 7, newtab: { look: 'paper', background: { kind: 'upload', ref: 'u1', treatment: 'led', inks: 'theme', dim: 0, blur: 0 } } }));
  assert.equal(film.newtab.background.treatment, 'led');
  assert.deepEqual(pic.newtab.layout, {});
});
