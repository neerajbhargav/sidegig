// Shows how the held-out labels differ from the model's own drafts, and which written rule
// changed each one. The drafts are what scripts/mail-codes-holdout.mjs prints (seeded, so a
// rerun with the same model build gives the same file); the labels are
// test/fixtures/mail-codes-holdout.jsonl.
//
// Usage: node scripts/mail-codes-label-diff.mjs [--write]
//   --write  save docs/evals/mail-codes-holdout-labels.json
import { readFileSync, writeFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const drafts = read('test/fixtures/mail-codes-holdout-drafts.jsonl');
const rows = read('test/fixtures/mail-codes-holdout.jsonl');
if (drafts.length !== rows.length) throw new Error(`${drafts.length} drafts, ${rows.length} labelled rows`);

const flat = (s) => s.replace(/[\s-]/g, '');
// The three written rules, in the order they are checked.
const RULES = {
  separators: 'Digit codes lose their spaces and dashes',
  absent: 'No code when the draft names a code that the subject and preview do not show',
  notSignIn: 'No code for reward, offer and meeting codes: they are not sign-in codes',
};
const changed = [];
drafts.forEach((d, i) => {
  const r = rows[i];
  if (d.subject !== r.subject || d.snippet !== r.snippet || d.prompt !== r.prompt) throw new Error(`${r.id}: text differs from the draft`);
  if (d.code === r.code) return;
  let rule = 'other';
  if (d.code && r.code && /^[\d\s-]+$/.test(d.code) && flat(d.code) === r.code) rule = 'separators';
  else if (d.code && r.code === null) rule = flat(`${d.subject}\n${d.snippet}`).includes(flat(d.code)) ? 'notSignIn' : 'absent';
  changed.push({ id: r.id, rule, draft: d.code, label: r.code, subject: r.subject, snippet: r.snippet });
});
const counts = Object.fromEntries([...Object.keys(RULES), 'other'].map((k) => [k, changed.filter((c) => c.rule === k).length]));
const report = {
  drafts: 'test/fixtures/mail-codes-holdout-drafts.jsonl',
  labels: 'test/fixtures/mail-codes-holdout.jsonl',
  rows: rows.length,
  changed: changed.length,
  rules: RULES,
  counts,
  command: 'node scripts/mail-codes-label-diff.mjs --write',
  rows_changed: changed,
};
console.log(`${changed.length} of ${rows.length} labels differ from the drafts: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
if (counts.other) for (const c of changed.filter((x) => x.rule === 'other')) console.log(`  other ${c.id}: draft=${c.draft} label=${c.label}`);
if (process.argv.includes('--write')) {
  writeFileSync(new URL('../docs/evals/mail-codes-holdout-labels.json', import.meta.url), `${JSON.stringify(report, null, 1)}\n`);
  console.log('wrote docs/evals/mail-codes-holdout-labels.json');
}
