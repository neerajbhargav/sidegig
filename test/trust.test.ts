import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustSender } from '../src/background/trust.ts';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}`;
const page = { id: ID, url: `${ORIGIN}/panel.html`, frameId: 0 };
const gmailFrame = { id: ID, url: 'https://mail.google.com/mail/u/0/#inbox', frameId: 7 };

test('page-only messages come only from sidegig pages', () => {
  for (const type of ['clear-sw', 'save-workspace', 'restore-workspace', 'sleep-tabs', 'refresh-status', 'edition-build', 'ask-page']) {
    assert.equal(trustSender(type, page, ID).ok, true, type);
    assert.equal(trustSender(type, gmailFrame, ID).ok, false, `${type} from a site`);
  }
});

test('site messages use the host the browser reports, not one named in the message', () => {
  assert.deepEqual(trustSender('badge', gmailFrame, ID), { ok: true, host: 'mail.google.com' });
  assert.deepEqual(trustSender('ai-claim', { ...gmailFrame, url: 'https://claude.ai/new' }, ID), { ok: true, host: 'claude.ai' });
  assert.equal(trustSender('profile-import', page, ID).ok, false, 'a sidegig page is not a site');
  assert.equal(trustSender('badge', { ...gmailFrame, url: 'http://mail.google.com/' }, ID).ok, false, 'https only');
});

test('cookies go only to framed apps', () => {
  assert.equal(trustSender('frame-cookies', gmailFrame, ID).ok, true);
  assert.equal(trustSender('frame-cookies', { ...gmailFrame, frameId: 0 }, ID).ok, false, 'a normal tab');
  assert.equal(trustSender('frame-cookies', { ...gmailFrame, frameId: undefined }, ID).ok, false);
});

test('other extensions are refused; shared messages pass', () => {
  assert.equal(trustSender('open-app', { ...page, id: 'otherextension' }, ID).ok, false);
  assert.equal(trustSender('open-app', gmailFrame, ID).ok, true);
  assert.equal(trustSender('tab-info', page, ID).ok, true);
  const dynamic = { id: ID, url: 'chrome-extension://0f1e2d3c-session-guid/drawer.html', frameId: 0 };
  assert.equal(trustSender('save-workspace', dynamic, ID).ok, true, 'the drawer at its per-session random host is still ours');
  assert.equal(trustSender('save-workspace', { ...dynamic, id: 'otherextension' }, ID).ok, false);
});
