import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, AUTH_HOSTS, MOBILE_UA } from '../src/background/dnr.ts';
import { parseGmailFeed } from '../src/background/status.ts';
import { isRestricted } from '../src/shared/rules.ts';
import { appFromCatalog } from '../src/shared/defaults.ts';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';

test('frame rules only cover frames sidegig opens and their own navigations', () => {
  const rules = buildRules([appFromCatalog('claude'), appFromCatalog('whatsapp')], [EXT]);
  assert.equal(rules.length, 2);
  for (const r of rules) {
    assert.deepEqual(r.condition.resourceTypes, ['sub_frame'], 'never top-level pages');
    assert.ok(r.condition.initiatorDomains?.length, 'always limited by who started the request');
  }
  const [mine, nav] = rules;
  assert.deepEqual(mine.condition.initiatorDomains, [EXT]);
  assert.ok(nav.condition.requestDomains!.includes('claude.ai'));
  assert.ok(nav.condition.requestDomains!.includes('web.whatsapp.com'));
  for (const h of AUTH_HOSTS) assert.ok(nav.condition.requestDomains!.includes(h));
  assert.ok(!nav.condition.initiatorDomains!.includes('evil.example'), 'other sites embedding an app get no change');
  assert.ok(nav.condition.initiatorDomains!.includes(EXT));
  assert.deepEqual(nav.condition.tabIds, [-1], 'only the browser sidebar until a drawer opens an app');
  const [, navDrawer] = buildRules([appFromCatalog('claude')], [EXT], [], [12]);
  assert.deepEqual(navDrawer.condition.tabIds, [-1, 12], 'plus tabs whose drawer shows apps');
  const removed = nav.action.responseHeaders!.map((h) => h.header);
  assert.ok(removed.includes('x-frame-options') && removed.includes('content-security-policy'));
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('mobile rule appears only when an app asks for it', () => {
  assert.equal(buildRules([{ ...appFromCatalog('gmail'), mobile: false }], [EXT]).length, 2);
  const mobile = { ...appFromCatalog('x'), mobile: true };
  const rules = buildRules([mobile], [EXT]);
  const ua = rules.filter((r) => r.action.requestHeaders?.some((h) => h.header === 'user-agent'));
  assert.equal(ua.length, 1);
  assert.equal(ua[0].action.requestHeaders?.find((h) => h.header === 'user-agent')?.value, MOBILE_UA);
  assert.deepEqual(ua[0].condition.requestDomains, ['x.com']);
  assert.deepEqual(ua[0].condition.resourceTypes, ['sub_frame']);
  // A docked side window's tab gets it for its whole page.
  const side = buildRules([mobile], [EXT], [42]).filter((r) => r.condition.resourceTypes?.includes('main_frame' as any));
  assert.deepEqual(side[0].condition.tabIds, [42]);
  assert.deepEqual(side[0].condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('Gmail never gets the phone user agent (Google then asks you to sign in again)', () => {
  const rules = buildRules([{ ...appFromCatalog('gmail'), mobile: true }, { ...appFromCatalog('x'), mobile: true }], [EXT], [42]);
  for (const r of rules.filter((r) => r.action.requestHeaders?.some((h) => h.header === 'user-agent'))) assert.deepEqual(r.condition.requestDomains, ['x.com']);
});

test('no apps still lets sidegig frame its own pages', () => {
  const rules = buildRules([], [EXT]);
  assert.equal(rules.length, 1);
});

test('gmail atom feed parsing', () => {
  const xml = `<?xml version="1.0"?><feed><fullcount>3</fullcount>
    <entry><title>Offer &amp; next steps</title><link rel="alternate" href="https://mail.google.com/mail?a=1&amp;b=2"/><id>tag:gmail.google.com,2004:1</id><author><name>Mercor</name></author></entry>
    <entry><title></title><id>tag:gmail.google.com,2004:2</id><author><name>Jane</name></author></entry></feed>`;
  const r = parseGmailFeed(xml);
  assert.equal(r.count, 3);
  assert.equal(r.entries[0].title, 'Offer & next steps');
  assert.equal(r.entries[0].url, 'https://mail.google.com/mail?a=1&b=2');
  assert.equal(r.entries[0].from, 'Mercor');
  assert.equal(r.entries[1].title, '(no subject)');
});

test('gmail feed entries carry the preview, time, sender address and message id', () => {
  const xml = `<feed><fullcount>1</fullcount><entry><title>Your verification code</title><summary>Enter 482913 to finish signing in.</summary>
    <link rel="alternate" href="https://mail.google.com/mail?account_id=me@example.com&amp;message_id=1a15fd7317beb608&amp;view=conv&amp;extsrc=atom" type="text/html" />
    <issued>2026-10-21T19:40:00Z</issued><id>tag:gmail.google.com,2004:1</id><author><name>Acme</name><email>no-reply@acme.example</email></author></entry></feed>`;
  const [e] = parseGmailFeed(xml).entries;
  assert.equal(e.summary, 'Enter 482913 to finish signing in.');
  assert.equal(e.at, Date.parse('2026-10-21T19:40:00Z'));
  assert.equal(e.email, 'no-reply@acme.example');
  assert.equal(e.mid, '1a15fd7317beb608');
});

test('restricted pages', () => {
  assert.ok(isRestricted('chrome://settings'));
  assert.ok(isRestricted('chrome-extension://abc/options.html'));
  assert.ok(isRestricted('https://chromewebstore.google.com/detail/x'));
  assert.ok(isRestricted(''));
  assert.ok(!isRestricted('https://github.com'));
  assert.ok(!isRestricted('file:///Users/me/a.html'));
});

test("frames the drawer opens from its random URL get the same rules as the extension's own", () => {
  const [mine, nav] = buildRules([appFromCatalog('claude')], [EXT, 'drawer-session-guid']);
  assert.deepEqual(mine.condition.initiatorDomains, [EXT, 'drawer-session-guid']);
  assert.ok(nav.condition.initiatorDomains!.includes('drawer-session-guid'));
});
