import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, AUTH_HOSTS, MOBILE_UA } from '../src/background/dnr.ts';
import { parseGmailFeed } from '../src/background/status.ts';
import { isRestricted } from '../src/shared/rules.ts';
import { appFromCatalog } from '../src/shared/defaults.ts';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';

test('frame rules only touch requests outside normal tabs', () => {
  const rules = buildRules([appFromCatalog('claude'), appFromCatalog('whatsapp')], EXT);
  assert.ok(rules.length >= 2);
  for (const r of rules) {
    assert.deepEqual(r.condition.resourceTypes, ['sub_frame']);
    // Never main_frame: normal browsing of these sites keeps its protections.
    assert.ok(!(r.condition.resourceTypes as string[]).includes('main_frame'));
  }
  const [byInitiator, byHost] = rules;
  assert.deepEqual(byInitiator.condition.tabIds, [-1]);
  assert.deepEqual(byInitiator.condition.initiatorDomains, [EXT]);
  assert.deepEqual(byHost.condition.tabIds, [-1]);
  assert.ok(byHost.condition.requestDomains!.includes('claude.ai'));
  assert.ok(byHost.condition.requestDomains!.includes('web.whatsapp.com'));
  for (const h of AUTH_HOSTS) assert.ok(byHost.condition.requestDomains!.includes(h));
  const removed = byHost.action.responseHeaders!.map((h) => h.header);
  assert.ok(removed.includes('x-frame-options') && removed.includes('content-security-policy'));
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('drawer and mobile rules appear only when needed', () => {
  const plain = buildRules([appFromCatalog('gmail')], EXT);
  assert.equal(plain.length, 2);
  const drawer = { ...appFromCatalog('translate'), openIn: 'drawer' as const };
  const mobile = { ...appFromCatalog('x'), mobile: true };
  const rules = buildRules([drawer, mobile], EXT);
  const drawerRule = rules.find((r) => !r.condition.tabIds && r.condition.initiatorDomains);
  assert.deepEqual(drawerRule?.condition.requestDomains, ['translate.google.com']);
  const mobileRule = rules.find((r) => r.action.requestHeaders?.some((h) => h.header === 'user-agent'));
  assert.equal(mobileRule?.action.requestHeaders?.find((h) => h.header === 'user-agent')?.value, MOBILE_UA);
  assert.deepEqual(mobileRule?.condition.requestDomains, ['x.com']);
  assert.deepEqual(mobileRule?.condition.tabIds, [-1]);
});

test('no apps still lets sidegig frame its own pages', () => {
  const rules = buildRules([], EXT);
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

test('restricted pages', () => {
  assert.ok(isRestricted('chrome://settings'));
  assert.ok(isRestricted('chrome-extension://abc/options.html'));
  assert.ok(isRestricted('https://chromewebstore.google.com/detail/x'));
  assert.ok(isRestricted(''));
  assert.ok(!isRestricted('https://github.com'));
  assert.ok(!isRestricted('file:///Users/me/a.html'));
});
