import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountIndex, withAccount, feedAccount } from '../src/shared/google.ts';

test('Google app addresses name their signed-in account', () => {
  assert.equal(accountIndex('https://mail.google.com/mail/u/0/'), 0);
  assert.equal(accountIndex('https://calendar.google.com/calendar/u/2/r'), 2);
  assert.equal(accountIndex('https://keep.google.com/u/1/'), 1);
  assert.equal(accountIndex('https://keep.google.com/'), null, 'no /u/N/: no picker');
  assert.equal(accountIndex('https://evil.example/mail/u/0/'), null);
  assert.equal(withAccount('https://mail.google.com/mail/u/0/#inbox', 3), 'https://mail.google.com/mail/u/3/#inbox');
});

test('an inbox feed names its account, in any language', () => {
  assert.equal(feedAccount('<feed><title>Gmail - Inbox for a.b@example.com</title><entry><title>x@y.z</title></entry></feed>'), 'a.b@example.com');
  assert.equal(feedAccount('<title>Gmail - Recibidos de c@d.org</title>'), 'c@d.org');
  assert.equal(feedAccount('<title>Gmail</title>'), null);
});
