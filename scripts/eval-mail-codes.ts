// Scores findCode() (src/shared/mail.ts) on the labeled corpus in
// test/fixtures/mail-codes.jsonl and prints precision and recall.
//
// Usage: node scripts/eval-mail-codes.ts [--misses] [--write]
//   --misses  list the dev-split rows it gets wrong (the test split is never listed, so it stays untuned)
//   --write   save docs/evals/mail-codes-<date>.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { findCode } from '../src/shared/mail.ts';
import { bootstrap95, round } from './evalstats.ts';

export interface CodeRow { v: number; id: string; split: 'dev' | 'test'; category: string; service: string; subject: string; snippet: string; code: string | null }
export type Outcome = 'tp' | 'fp' | 'fn' | 'tn' | 'wrong';
export interface Scored extends CodeRow { got: string | null; outcome: Outcome }

const norm = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();

export function loadCodeRows(path = new URL('../test/fixtures/mail-codes.jsonl', import.meta.url)): CodeRow[] {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as CodeRow);
}

/** One outcome per row. A wrong code on a mail that has one counts as a false positive and a miss. */
export function scoreRow(r: CodeRow, find = findCode): Scored {
  const got = find(r.subject, r.snippet);
  const outcome: Outcome = r.code ? (got ? (norm(got) === norm(r.code) ? 'tp' : 'wrong') : 'fn') : got ? 'fp' : 'tn';
  return { ...r, got, outcome };
}

export function metrics(rows: Scored[]) {
  const n = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
  const tp = n('tp');
  const fp = n('fp') + n('wrong');
  const fn = n('fn') + n('wrong');
  return { n: rows.length, positives: rows.filter((r) => r.code).length, tp, fp, fn, tn: n('tn'), wrong: n('wrong'), precision: tp / (tp + fp), recall: tp / (tp + fn) };
}

function summary(rows: Scored[]) {
  const m = metrics(rows);
  return {
    ...m,
    precision: round(m.precision),
    recall: round(m.recall),
    precision_ci95: bootstrap95(rows, (s) => metrics(s).precision).map((x) => round(x)),
    recall_ci95: bootstrap95(rows, (s) => metrics(s).recall).map((x) => round(x)),
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const rows = loadCodeRows().map((r) => scoreRow(r));
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const report = {
    eval: 'mail-codes',
    corpus: 'test/fixtures/mail-codes.jsonl',
    corpus_version: rows[0]?.v,
    detector: 'findCode in src/shared/mail.ts',
    commit: execSync('git rev-parse --short HEAD').toString().trim(),
    dirty: execSync('git status --porcelain -- src/shared/mail.ts test/fixtures/mail-codes.jsonl').toString().trim() !== '',
    date: new Date().toISOString(),
    command: 'node scripts/eval-mail-codes.ts --write',
    all: summary(rows),
    dev: summary(rows.filter((r) => r.split === 'dev')),
    test: summary(rows.filter((r) => r.split === 'test')),
    by_category: Object.fromEntries([...new Set(rows.map((r) => r.category))].sort().map((c) => {
      const m = metrics(rows.filter((r) => r.category === c));
      return [c, { n: m.n, tp: m.tp, fp: m.fp, fn: m.fn }];
    })),
    errors: rows.filter((r) => r.outcome === 'fp' || r.outcome === 'fn' || r.outcome === 'wrong').map((r) => ({ id: r.id, split: r.split, category: r.category, outcome: r.outcome, want: r.code, got: r.got })),
  };
  for (const k of ['all', 'dev', 'test'] as const) {
    const s = report[k];
    console.log(`${k.padEnd(4)} n=${s.n} positives=${s.positives} precision=${pct(s.precision)} [${s.precision_ci95.map(pct).join(', ')}] recall=${pct(s.recall)} [${s.recall_ci95.map(pct).join(', ')}] tp=${s.tp} fp=${s.fp} fn=${s.fn} wrong=${s.wrong}`);
  }
  if (process.argv.includes('--misses')) for (const r of rows.filter((r) => r.split === 'dev' && r.outcome !== 'tp' && r.outcome !== 'tn')) console.log(`  ${r.outcome.padEnd(5)} ${r.id} [${r.category}] want=${r.code} got=${r.got} :: ${r.subject} | ${r.snippet}`);
  if (process.argv.includes('--write')) {
    mkdirSync(new URL('../docs/evals/', import.meta.url), { recursive: true });
    const file = new URL(`../docs/evals/mail-codes-${report.date.slice(0, 10)}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(report, null, 1) + '\n');
    console.log(`wrote ${file.pathname}`);
  }
}
