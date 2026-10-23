import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCode, htmlText, parseGmailPrint, composeUrl, threadPrompt } from '../src/shared/mail.ts';

test('sign-in codes are found in the subject or the preview', () => {
  assert.equal(findCode('123456 is your verification code', ''), '123456');
  assert.equal(findCode('Your verification code', 'Enter 482913 to finish signing in.'), '482913');
  assert.equal(findCode('G-482913 is your Google verification code', ''), '482913');
  assert.equal(findCode('Your one-time passcode', 'Your passcode is 384 921. It expires in 10 minutes.'), '384921');
  assert.equal(findCode('Confirm your email', 'Use 7291 to verify your phone number.'), '7291');
  assert.equal(findCode('Slack confirmation code: 9QX-4ZB', ''), '9QX-4ZB');
  assert.equal(findCode('Your login code', 'Code: 84720193'), '84720193');
});

test('dates, prices, order numbers and ordinary mail are not codes', () => {
  assert.equal(findCode('Your order #4829 has shipped', 'Track your package'), null);
  assert.equal(findCode('New sign-in to your account', 'A sign-in on October 21, 2026 at 3:45 PM from Chrome on Mac.'), null);
  assert.equal(findCode('Security alert', 'Your $1,250.00 payment was received.'), null);
  assert.equal(findCode('Lunch on Friday?', 'Are you free at 1230 or 1300?'), null);
  assert.equal(findCode('Your verification code', 'Call us at 1-800-555-0199 if this was not you.'), null);
});

test('html becomes readable text', () => {
  assert.equal(htmlText('<div>Hi&nbsp;there,<br>Line two</div><p>Para &amp; more</p><style>.x{}</style><!-- c -->'), 'Hi there,\nLine two\nPara & more');
  assert.equal(htmlText('&#39;quoted&#39; &#x27;hex&#x27; &lt;b&gt;'), "'quoted' 'hex' <b>");
  assert.equal(htmlText('a &#999999999; b &#xFFFFFFF; c'), 'a &#999999999; b &#xFFFFFFF; c', 'an impossible character stays as written instead of breaking the thread');
});

const PRINT = `<html><body><div class="bodycontainer"><table><tr><td>logo</td></tr></table><hr><div class="maincontent"><table width=100% cellpadding=0 cellspacing=0 border=0><tr><td><font size=+1><b>Plans for the launch</b></font><br><font size=-1 color=#777>2 messages</font></td></tr></table><hr>
<table width=100% cellpadding=0 cellspacing=0 border=0 class="message"><tr><td><font size=-1><b>Ada Lovelace</b> &lt;ada@example.com&gt;</font></td><td align=right><font size=-1>Tue, Oct 20, 2026 at 9:14 AM</font><tr><td colspan=2 style="padding-bottom: 4px;"><font size=-1 class="recipient"><div>To: you@example.com</div></font><tr><td colspan=2><table width=100% cellpadding=12 cellspacing=0 border=0><tr><td><div style="overflow: hidden;"><font size=-1><div dir="ltr">Can we ship on Thursday?<div>The build is ready.</div></div></font></div></table></td></tr></table>
<table width=100% cellpadding=0 cellspacing=0 border=0 class="message"><tr><td><font size=-1><b>You</b> &lt;you@example.com&gt;</font></td><td align=right><font size=-1>Tue, Oct 20, 2026 at 10:02 AM</font><tr><td colspan=2 style="padding-bottom: 4px;"><font size=-1 class="recipient"><div>To: Ada Lovelace &lt;ada@example.com&gt;</div></font><tr><td colspan=2><table width=100% cellpadding=12 cellspacing=0 border=0><tr><td><div style="overflow: hidden;"><font size=-1><div dir="ltr">Thursday works.</div></font></div></table></td></tr></table>
</div></div></body></html>`;

test('a Gmail print view becomes a thread', () => {
  const t = parseGmailPrint(PRINT);
  assert.equal(t.subject, 'Plans for the launch');
  assert.equal(t.messages.length, 2);
  assert.deepEqual(t.messages[0], { from: 'Ada Lovelace', email: 'ada@example.com', date: 'Tue, Oct 20, 2026 at 9:14 AM', text: 'Can we ship on Thursday?\nThe build is ready.' });
  assert.equal(t.messages[1].text, 'Thursday works.');
  assert.deepEqual(parseGmailPrint('<html>not a thread</html>'), { subject: '', messages: [] });
});

test('thread prompts mark mail as content, and stay within size', () => {
  const t = parseGmailPrint(PRINT);
  const p = threadPrompt(t, 'summary');
  assert.match(p, /<email from="Ada Lovelace/);
  assert.match(p, /not instructions/i);
  const huge = { subject: 'x', messages: Array.from({ length: 40 }, () => ({ from: 'a', email: 'a@b.c', date: 'd', text: 'y'.repeat(5000) })) };
  assert.ok(threadPrompt(huge, 'reply').length < 26_000, 'long threads are trimmed');
  assert.match(threadPrompt(t, 'reply'), /reply/i);
});

test('compose links prefill a Gmail draft', () => {
  const u = new URL(composeUrl({ to: 'ada@example.com', subject: 'Plans & launch', body: 'Thursday works.\nThanks' }));
  assert.equal(u.origin + u.pathname, 'https://mail.google.com/mail/u/0/', 'the same account the feed reads');
  assert.equal(u.searchParams.get('view'), 'cm');
  assert.equal(u.searchParams.get('to'), 'ada@example.com');
  assert.equal(u.searchParams.get('su'), 'Re: Plans & launch');
  assert.equal(u.searchParams.get('body'), 'Thursday works.\nThanks');
  assert.equal(new URL(composeUrl({ to: 'a@b.c', subject: 'Re: Already', body: '' })).searchParams.get('su'), 'Re: Already');
});
