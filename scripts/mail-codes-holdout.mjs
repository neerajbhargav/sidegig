// Drafts a held-out set for the sign-in code eval with a local model, so the
// subjects and previews are not written by whoever tuned findCode(). The same
// author wrote these prompts and the labelling rules, and picked the negative
// categories after reading the old detector's false positives.
//
// The labels in test/fixtures/mail-codes-holdout.jsonl are the model's own
// "code" fields, corrected by three written rules; no person reviewed every row.
// scripts/mail-codes-label-diff.mjs lists each changed label and its rule.
//
// Usage: node scripts/mail-codes-holdout.mjs > test/fixtures/mail-codes-holdout-drafts.jsonl
//   needs Ollama on 127.0.0.1:11434 with qwen2.5-coder:7b (free, local). Seeded:
//   with the same model build (digest dae161e27b0e, Ollama 0.40.8) the output is
//   the same byte for byte; a retagged model can change it.
const MODEL = 'qwen2.5-coder:7b';
const PER_PROMPT = 10;

const POS = [
  'a bank or credit card company', 'an online game or game store', 'a team chat or work software company', 'a shopping site',
  'a social network', 'a cryptocurrency exchange', 'a government services portal', 'a health insurance or patient portal',
  'a mobile phone carrier', 'a cloud hosting or developer platform', 'a food delivery or ride app', 'an airline loyalty account',
];
const POS_LANG = ['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch'];
const NEG = [
  'online order confirmations and shipping notices with order numbers and prices',
  'package delivery and tracking updates with tracking numbers',
  'bank account alerts that mention card endings, amounts and phone numbers, but contain no code',
  'calendar and video meeting invitations with meeting IDs, dial-in numbers and meeting passcodes',
  'flight, hotel and car rental confirmations with confirmation numbers and flight numbers',
  'invoices, receipts and subscription renewals with invoice numbers and amounts',
  'security notices about a new sign-in or a password change, with dates, times and locations, but no code',
  'marketing emails with promo codes, discount percentages and prices',
  'support ticket and case updates with case numbers',
  'appointment reminders with dates, times, room numbers and phone numbers',
  'parcel locker and store pickup notices with pickup codes',
  'software release and security update notices with version and build numbers',
  'utility bills and account statements with account numbers and amounts',
  'gift card and voucher emails with card numbers and PINs',
  'newsletters and event tickets with years, seat numbers and ticket numbers',
];

const prompt = (what, positive) => `Write ${PER_PROMPT} different, realistic email notifications: ${what}.
For each, give the subject line and the preview text an inbox shows (the first 80 to 160 characters of the body).
${positive ? 'Each email contains a one-time sign-in or verification code. Vary the code formats (4 to 8 digits, digits with a space or dash, letters and digits) and where the code appears (subject or preview). In "code", copy the code exactly as it appears.' : 'None of these emails contains a one-time sign-in or verification code. Set "code" to null.'}
Use made-up company names and people. Answer with JSON only: {"emails":[{"subject":"...","snippet":"...","code":${positive ? '"..."' : 'null'}}]}`;

async function ask(text, seed) {
  const r = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, prompt: text, format: 'json', stream: false, options: { seed, temperature: 0.9, num_predict: 2500 } }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return JSON.parse((await r.json()).response).emails ?? [];
}

const jobs = [
  ...POS.map((s) => [`sign-in and verification code emails from ${s}`, true]),
  ...POS_LANG.map((l) => [`sign-in and verification code emails written in ${l}`, true]),
  ...NEG.map((n) => [n, false]),
];
let seed = 1;
for (const [what, positive] of jobs) {
  const emails = await ask(prompt(what, positive), seed++).catch((e) => (console.error(what, e.message), []));
  for (const e of emails.slice(0, PER_PROMPT)) {
    if (typeof e?.subject !== 'string' || typeof e?.snippet !== 'string') continue;
    console.log(JSON.stringify({ prompt: what, subject: e.subject, snippet: e.snippet, code: positive ? String(e.code ?? '') || null : null }));
  }
  console.error(`done: ${what}`);
}
