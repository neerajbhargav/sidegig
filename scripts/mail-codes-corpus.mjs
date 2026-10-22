// Writes test/fixtures/mail-codes.jsonl: a labeled corpus for findCode() in
// src/shared/mail.ts. Every row is synthetic. Positives are modelled on the
// public shape of sign-in code emails from common services; negatives are hard
// cases that carry a code keyword and a number that is not a sign-in code
// (orders, prices, phone numbers, dates, tracking IDs, versions, meeting IDs).
// The label is known because the generator puts it there.
//
// Templates alternate between the "dev" split (used while improving the
// detector) and the "test" split (only scored, never tuned on).
//
// Usage: node scripts/mail-codes-corpus.mjs   (rewrites the fixture; output is deterministic)
import { writeFileSync } from 'node:fs';

const VERSION = 1;
const PER_TEMPLATE = 3;

// mulberry32: a small seeded generator, so the corpus is the same on every run.
let seed = 20261022;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const alnum = (n, set = ALNUM) => {
  // Mixed letters and digits, like the codes services print.
  for (;;) {
    const s = Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('');
    if (/\d/.test(s) && /[A-Za-z]/.test(s)) return s;
  }
};

// Values that templates fill in. Each call gives a new value.
const V = {
  user: () => pick(['ada', 'grace.h', 'linus_t', 'mkatz', 'j.doe', 'riverside42']),
  email: () => `${pick(['a', 'g', 'm', 'j', 'r'])}***@example.com`,
  phone: () => pick([`1-800-555-0${digits(3)}`, `(415) 555-0${digits(3)}`, `+1 415 555 0${digits(3)}`, `415.555.0${digits(3)}`, `+44 20 7946 0${digits(3)}`]),
  amount: () => pick([`${1 + Math.floor(rnd() * 9)},${digits(3)}.${digits(2)}`, `${10 + Math.floor(rnd() * 90)}.${digits(2)}`, `${100 + Math.floor(rnd() * 900)}.00`]),
  date: () => pick(['10/21/2026', '21/10/2026', '2026-10-21', 'Oct 21, 2026', '21.10.2026']),
  time: () => pick(['3:45 PM', '14:30', '09:05 UTC', '11:59 pm']),
  merchant: () => pick(['Corner Books', 'Example Air', 'Springfield Grocers', 'City Transit']),
  svc: () => pick(['Acme', 'Northwind', 'Contoso', 'Example Bank', 'Fabrikam', 'Tailspin']),
  city: () => pick(['Springfield', 'Riverton', 'Lakeside', 'Fairview']),
  month: () => pick(['January', 'March', 'June', 'October', 'December']),
};

// A code generator returns [shown in the email, label findCode should return].
const C = {
  d4: () => ((x) => [x, x])(digits(4)),
  d5: () => ((x) => [x, x])(digits(5)),
  d6: () => ((x) => [x, x])(digits(6)),
  d7: () => ((x) => [x, x])(digits(7)),
  d8: () => ((x) => [x, x])(digits(8)),
  dash33: () => ((a, b) => [`${a}-${b}`, a + b])(digits(3), digits(3)),
  space33: () => ((a, b) => [`${a} ${b}`, a + b])(digits(3), digits(3)),
  slack: () => ((a, b) => [`${a}-${b}`, `${a}-${b}`])(alnum(3), alnum(3)),
  alnum5: () => ((x) => [x, x])(alnum(5)),
  alnum6: () => ((x) => [x, x])(alnum(6)),
  lower8: () => ((x) => [x, x])(alnum(8, 'abcdefghjkmnpqrstuvwxyz23456789')),
  yearlike: () => ((x) => [x, x])(String(pick([1987, 1994, 2003, 2019, 2031, 2048]))),
};

// [category, service, subject, snippet]. {code} is the code; {x} fills from V.
const POSITIVE = [
  ['digits-6', 'Google', 'G-{code} is your Google verification code', 'Use this code to verify it is you.', 'gprefix'],
  ['digits-6', 'Google', 'Google verification code', 'Your Google verification code is {code}. Do not share it with anyone.'],
  ['digits-6', 'Microsoft', 'Microsoft account security code', 'Please use the following security code for the Microsoft account {email}. Security code: {code}'],
  ['digits-7', 'Microsoft', 'Your single-use code', 'Hi {email}, we received your request for a single-use code to use with your Microsoft account. Your single-use code is: {code}', 'd7'],
  ['digits-6', 'Apple', 'Verify your Apple Account email address', 'Enter this verification code to finish: {code}. The code expires 3 hours after this email was sent.'],
  ['digits-6', 'Amazon', 'Verify your new account', 'To verify your email address, please use the following One Time Password (OTP): {code}. Do not share this OTP with anyone.'],
  ['distractor-phone', 'Amazon', 'Your one-time password', '{code} is your one-time password. It expires in 10 minutes. If you did not request it, call {phone}.'],
  ['digits-6', 'GitHub', '[GitHub] Please verify your device', 'Hey {user}! A sign in attempt requires further verification. Verification code: {code}'],
  ['digits-8', 'GitHub', 'Your GitHub launch code', 'Here is your GitHub launch code: {code}. Continue signing up by entering the code.', 'd8'],
  ['alnum-dash', 'Slack', 'Slack confirmation code: {code}', 'Your confirmation code is below. Enter it in your open browser window and we will help you get signed in.', 'slack'],
  ['digits-6', 'Discord', 'Your Discord verification code', 'Here is your verification code: {code}. It expires in 10 minutes.'],
  ['digits-6', 'Stripe', 'Your Stripe verification code', '{code} is your Stripe verification code. Never share it.'],
  ['digits-6', 'PayPal', 'Your security code', 'PayPal: {code} is your security code. Do not share your code.'],
  ['digits-4', 'Uber', 'Your Uber sign-in code', 'Welcome back. Enter {code} to sign in to Uber.', 'd4'],
  ['digits-6', 'Instagram', '{code} is your Instagram code', 'Someone tried to log in to your Instagram account. If this was you, enter this code.'],
  ['prefix-digits', 'Facebook', 'FB-{code} is your Facebook confirmation code', 'Enter this code to confirm your account.', 'd5'],
  ['digits-6', 'Facebook', 'Your Facebook security code', 'Your login code is {code}. Enter it to log in.'],
  ['digits-6', 'LinkedIn', 'Here is your verification code', 'Please use this verification code to complete your sign in: {code}.'],
  ['alnum-lower', 'X', 'Your X confirmation code is {code}', 'Please enter this verification code to get started on X.', 'lower8'],
  ['digits-7', 'Coinbase', 'Coinbase verification code', 'Your verification code is {code}. Coinbase will never call you to ask for this code.', 'd7'],
  ['alnum-5', 'Steam', 'Your Steam account: Access from new web or mobile device', 'Here is the Steam Guard code you need to login to account {user}: {code}', 'alnum5'],
  ['distractor-count', 'Epic Games', 'Your Epic Games security code', 'Here is your 6-digit security code: {code}'],
  ['digits-6', 'Zoom', 'Zoom sign in verification code', 'Your verification code is: {code}. This code will expire in 10 minutes.'],
  ['digits-6', 'Dropbox', 'Your Dropbox security code', 'Enter this code to finish signing in: {code}'],
  ['digits-6', 'Okta', 'One-time verification code', 'Your verification code is {code}. Enter this code in Okta Verify or your browser.'],
  ['digits-6', 'generic', 'Verification code', 'Your verification code is: {code}'],
  ['digits-6', 'Adobe', 'Your Adobe verification code', '{code} - use this code to verify your account.'],
  ['digits-spaced', 'Shopify', 'Your login code', 'Your Shopify login code is {code}', 'space33'],
  ['digits-6', 'Binance', '[Binance] Login Verification Code', 'Your verification code: {code}. The verification code will be valid for 30 minutes.'],
  ['digits-4', 'Netflix', 'Your sign-in code', 'Enter this code to sign in: {code}. This code will expire in 15 minutes.', 'd4'],
  ['digits-6', 'Airbnb', 'Airbnb verification code', 'Your Airbnb verification code is {code}.'],
  ['digits-dash', 'WhatsApp', 'WhatsApp code', 'Your WhatsApp code: {code}. Do not share this code with others.', 'dash33'],
  ['digits-5', 'Telegram', 'Login code', 'Login code: {code}. Do not give this code to anyone, even if they say they are from Telegram!', 'd5'],
  ['digits-dash', 'Signal', 'Signal registration', 'Your Signal registration code is {code}', 'dash33'],
  ['digits-6', 'ChatGPT', 'Your ChatGPT code is {code}', 'Enter this temporary verification code to continue.'],
  ['alnum-6', 'generic', 'Your verification code', 'Use this code to verify your email: {code}', 'alnum6'],
  ['digits-8', 'bank', 'Your one-time passcode', 'Your one-time passcode is {code}. Do not share it. We will never ask for it.', 'd8'],
  ['distractor-amount', 'bank', 'Confirm your payment', 'Use code {code} to confirm your payment of ${amount} to {merchant}.'],
  ['distractor-date', 'generic', 'Your verification code', 'Your code is {code}. It expires at {time} on {date}.'],
  ['distractor-order', 'shop', 'Confirm your order', 'Enter {code} to confirm order #{order}.', 'd4'],
  ['digits-6', 'generic', 'Sign in to {svc}', '{code} is your {svc} sign-in code.'],
  ['subject-only', 'generic', '{svc} code: {code}', ''],
  ['digits-6', 'generic', 'Your 2FA code', '{code}'],
  ['digits-6', 'generic', 'Two-factor authentication code', 'Your two-factor authentication code is {code}.'],
  ['digits-6', 'generic', 'Your passcode', 'Passcode: {code}'],
  ['digits-4', 'bank', 'Your login PIN', 'Your PIN is {code}. It is valid for 5 minutes.', 'd4'],
  ['digits-6', 'generic', 'Your magic code', 'Your magic code is {code}'],
  ['digits-6', 'generic', 'Your access code', 'Here is your access code: {code}'],
  ['digits-spaced', 'generic', 'Verification code', 'Your code: {code}', 'space33'],
  ['non-english', 'generic', 'Ihr Bestätigungscode', 'Ihr Bestätigungscode lautet {code}. Er ist 10 Minuten gültig.'],
  ['non-english', 'generic', 'Votre code de vérification', 'Votre code de vérification est {code}.'],
  ['non-english', 'generic', 'Tu código de verificación', 'Tu código de verificación es {code}.'],
  ['non-english', 'generic', 'Seu código de verificação', 'Seu código é {code}.'],
  ['non-english', 'generic', '認証コード', '認証コード: {code}'],
  ['non-english', 'generic', 'Il tuo codice di verifica', 'Il codice è {code}.'],
  ['non-english', 'generic', 'Je verificatiecode', 'Je verificatiecode is {code}.'],
  ['year-like', 'generic', 'Your sign-in code', 'Your sign-in code is {code}.', 'yearlike'],
  ['digits-6', 'generic', 'Security code', 'Your security code is:\n{code}'],
  ['distractor-ref', 'generic', 'Your verification code', 'Code {code} (request reference {ref}).'],
  ['distractor-phone', 'bank', 'Your login code', 'Your login code is {code}. Questions? Call {phone}.', 'd8'],
  ['digits-6', 'generic', 'Verification code ({code})', 'Enter it on the sign-in page.'],
  ['digits-6', 'generic', 'Use {code} as your {svc} code', 'This code works once.'],
  ['digits-6', '1Password', 'Your 1Password verification code', 'Enter {code} to verify your email.'],
  ['distractor-id', 'generic', 'Sign-in attempt', 'Code: {code}. Device ID: {devid}.'],
  ['digits-4', 'generic', 'Your one-time code', 'Your one-time code is {code}', 'd4'],
  ['digits-6', 'generic', 'Confirm your email address', 'Your confirmation code is {code}. Enter it in the app to finish signing up.'],
];

// [category, subject, snippet]. None of these is a sign-in code.
const NEGATIVE = [
  ['order', 'Your order #{order} has shipped', 'Track your package. Confirmation will follow.'],
  ['order', 'Order {order} confirmed', 'Thanks for your purchase. We will email you when it ships.'],
  ['order', 'Your order of headphones has shipped', 'Order 112-{d7}-{d7}. Your confirmation and receipt are attached.'],
  ['order', 'Order No. {d6} confirmed', 'Estimated delivery: {date}.'],
  ['price', 'Payment confirmation', 'Your payment of ${amount} was received on {date}.'],
  ['price', 'Payment confirmed: {d4} USD', 'Thanks, {user}. Your receipt is attached.'],
  ['price', 'Confirm your subscription', '€{amount} per month, renews on {date}.'],
  ['price', 'Security deposit received', 'We received your security deposit of {d4} EUR.'],
  ['phone', 'Security alert', 'If this was not you, call us at {phone}.'],
  ['phone', 'Your PIN was changed', 'Your PIN was changed on {date}. If this was not you, call {phone}.'],
  ['phone', 'Verify your phone number', 'We will text a code to {phone}. Reply STOP to opt out.'],
  ['phone', 'Account security', 'Support line: {phone} ext. {d4}'],
  ['date', 'Sign-in from a new device', 'We noticed a sign-in on {date} at {time}.'],
  ['date', 'New sign-in to your account', 'A sign-in on {month} 21, 2026 at {time} from Chrome on Mac.'],
  ['date', 'Security report {compactdate}', 'Your weekly security summary is ready.'],
  ['time', 'Security notice', 'A login at {mil} UTC from {city} was blocked.'],
  ['tracking', 'Your package is on the way', 'Tracking number: 1Z{track}. Confirm your delivery preferences.'],
  ['tracking', 'Delivery confirmation', 'USPS tracking 9400 {d4} {d4} {d4} {d4} {d2} was delivered.'],
  ['tracking', 'Delivery confirmation', 'Parcel ID {d4} {d4} was delivered to your locker.'],
  ['version', 'Security update available', 'Version {ver} fixes {n} issues. Update to stay protected.'],
  ['version', 'Security update ready', 'Build {d4} is ready to install. Restart to finish.'],
  ['version', 'Security advisory', 'CVE-2026-{d5} affects version {ver}. Upgrade now.'],
  ['card', 'Security alert for your card', 'A purchase on your card ending in {d4} was declined.'],
  ['card', 'Confirm your direct deposit', 'Account ending {d4} will receive deposits from {date}.'],
  ['card', 'Security: new card added', 'Card ****{d4} was added to your wallet.'],
  ['meeting', 'Invitation: Weekly sync', 'Join Zoom Meeting. Meeting ID: {d3} {d4} {d4}. Passcode: {d6}'],
  ['meeting', 'Updated invitation: Design review', 'Join by phone: {phone}, PIN: {d6}#'],
  ['booking', 'Your booking confirmation', 'Confirmation number: {d7}. Check-in {date}.'],
  ['booking', 'Your flight confirmation code', 'Confirmation code {alnum6}. Flight EX {d4} departs at {time}.'],
  ['booking', 'Confirm your reservation', 'Room {d4}, check-in 3 PM on {date}.'],
  ['booking', 'Check-in confirmation', 'Flight UA {d4} departs at 08:15 from gate B12.'],
  ['ticket', 'Support case {d8} confirmed', 'We received your request and will reply soon.'],
  ['ticket', 'Your verification is complete', 'Thanks for verifying. Case {d5} is closed.'],
  ['ticket', 'Invoice INV-{d5} confirmation', 'Total due ${amount} by {date}.'],
  ['promo', 'Your code inside: SAVE20', 'Use code SAVE20 for 20% off this weekend.'],
  ['promo', 'A welcome code for you', 'Use code FALL2026 at checkout.'],
  ['promo', 'Confirm your rewards', 'You earned {d4} points this month.'],
  ['link', 'Sign in to {svc}', 'Click the link below to sign in. This link expires in 24 hours.'],
  ['link', 'Reset your password', 'We received a request to reset your password. The link expires in 60 minutes.'],
  ['link', 'Verify your email address', 'Click the button to confirm your email address for {svc}.'],
  ['link', 'Your code has expired', 'Request a new code from the sign-in page.'],
  ['address', 'Confirm your address', '{d3} Main St, Springfield, IL {d5}'],
  ['address', 'Security check: new login', 'New login from IP 192.168.{d1}.{d3} near {city}.'],
  ['count', 'Your security key backup', 'You have 10 backup codes left.'],
  ['count', 'Two-factor authentication enabled', 'You turned on 2FA on {date}. Recovery codes were generated.'],
  ['count', 'Security summary', '3 sign-ins this week from 2 devices.'],
  ['calendar', 'Confirmed: Dentist appointment', 'Tue Oct 21, 2026 10:30am to 11:30am. Room {d4}.'],
  ['plain', 'Lunch on Friday?', 'Are you free at 1230 or 1300?'],
  ['plain', 'Your 2026 security checklist', 'Five steps to keep your account safe this year.'],
  ['plain', 'Quarterly report', 'Revenue was {d4} units in Q3, up from {d4}.'],
];

function fill(t, vals) {
  return t.replace(/\{(\w+)\}/g, (_, k) => {
    if (k in vals) return vals[k];
    if (V[k]) return V[k]();
    const m = k.match(/^d(\d)$/);
    if (m) return digits(Number(m[1]));
    if (k === 'order') return digits(4 + Math.floor(rnd() * 3));
    if (k === 'ref') return digits(8);
    if (k === 'devid') return `${digits(4)}-${digits(4)}`;
    if (k === 'compactdate') return pick(['20261021', '20261019', '20260930']);
    if (k === 'mil') return pick(['0930', '1430', '2215']);
    if (k === 'track') return alnum(16);
    if (k === 'ver') return pick(['10.4.2', '131.0.6778.85', '2.18', '4.2.1']);
    if (k === 'n') return String(2 + Math.floor(rnd() * 20));
    if (k === 'alnum6') return alnum(6);
    throw new Error(`unknown slot {${k}}`);
  });
}

const rows = [];
POSITIVE.forEach(([category, service, subject, snippet, kind = 'd6'], ti) => {
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const [shown, label] = kind === 'gprefix' ? C.d6() : C[kind]();
    const svc = V.svc();
    rows.push({ id: `pos-${ti + 1}-${i + 1}`, split: ti % 2 ? 'test' : 'dev', category, service, subject: fill(subject, { code: shown, svc }), snippet: fill(snippet, { code: shown, svc }), code: label });
  }
});
NEGATIVE.forEach(([category, subject, snippet], ti) => {
  for (let i = 0; i < PER_TEMPLATE; i++) {
    const svc = V.svc();
    rows.push({ id: `neg-${ti + 1}-${i + 1}`, split: ti % 2 ? 'test' : 'dev', category, service: '', subject: fill(subject, { svc }), snippet: fill(snippet, { svc }), code: null });
  }
});

const out = new URL('../test/fixtures/mail-codes.jsonl', import.meta.url);
writeFileSync(out, rows.map((r) => JSON.stringify({ v: VERSION, ...r })).join('\n') + '\n');
const pos = rows.filter((r) => r.code).length;
console.log(`wrote ${rows.length} rows (${pos} with a code, ${rows.length - pos} without) to test/fixtures/mail-codes.jsonl`);
