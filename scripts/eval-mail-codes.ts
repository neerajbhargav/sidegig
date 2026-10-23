// Scores findCode() (src/shared/mail.ts) on a labeled corpus and prints
// precision and recall with a bootstrap 95% interval.
//
// Usage: node scripts/eval-mail-codes.ts [--corpus <jsonl>] [--rev <git rev>] [--misses] [--write]
//   --corpus  default test/fixtures/mail-codes.jsonl; the held-out set is test/fixtures/mail-codes-holdout.jsonl
//   --rev     score findCode as it was at that commit (default: the working tree)
//   --misses  list the dev-split rows it gets wrong. Rows in the test split and the held-out set are
//             never listed, so they stay untuned; --misses on the held-out set is refused.
//   --write   save docs/evals/mail-codes[-holdout]-<date>-<rev>.json
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findCode } from '../src/shared/mail.ts';
import { bootstrap95, round } from './evalstats.ts';

export interface CodeRow { v: number; id: string; split: 'dev' | 'test' | 'holdout'; category: string; service: string; subject: string; snippet: string; code: string | null }
export type Outcome = 'tp' | 'fp' | 'fn' | 'tn' | 'wrong';
export interface Scored extends CodeRow { got: string | null; outcome: Outcome }
export type Find = (subject: string, snippet: string) => string | null;

export const CORPUS = new URL('../test/fixtures/mail-codes.jsonl', import.meta.url);
export const HOLDOUT = new URL('../test/fixtures/mail-codes-holdout.jsonl', import.meta.url);

export function loadCodeRows(path: URL | string = CORPUS): CodeRow[] {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as CodeRow);
}

/** One outcome per row, by exact match with the label. A wrong code on a mail that has one counts as a false positive and a miss. */
export function scoreRow(r: CodeRow, find: Find = findCode): Scored {
  const got = find(r.subject, r.snippet);
  const outcome: Outcome = r.code ? (got ? (got === r.code ? 'tp' : 'wrong') : 'fn') : got ? 'fp' : 'tn';
  return { ...r, got, outcome };
}

/** findCode as it was at `rev`, imported from a temporary copy of src/shared (mail.ts imports its neighbours, such as prompt.ts). Call done() after scoring. */
export async function findCodeAt(rev: string): Promise<{ find: Find; done: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'mailcodes-'));
  execSync(`git archive ${rev} src/shared | tar -x -C ${JSON.stringify(dir)}`);
  const find = (await import(pathToFileURL(join(dir, 'src/shared/mail.ts')).href)).findCode as Find;
  return { find, done: () => rmSync(dir, { recursive: true, force: true }) };
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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const corpusPath = arg('--corpus') ?? CORPUS.pathname;
  const rev = arg('--rev');
  const holdout = /holdout/.test(corpusPath);
  if (holdout && process.argv.includes('--misses')) {
    console.error('--misses lists only dev rows; the held-out set is never listed, so it stays untuned.');
    process.exit(2);
  }
  const at = rev ? await findCodeAt(rev) : { find: findCode, done: () => {} };
  const rows = loadCodeRows(corpusPath).map((r) => scoreRow(r, at.find));
  at.done();
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const head = execSync('git rev-parse --short HEAD').toString().trim();
  const report = {
    eval: holdout ? 'mail-codes-holdout' : 'mail-codes',
    corpus: corpusPath.replace(/^.*\/(test\/fixtures\/)/, '$1'),
    corpus_version: rows[0]?.v,
    detector: `findCode in src/shared/mail.ts at ${rev ? execSync(`git rev-parse --short ${rev}`).toString().trim() : `${head} (working tree)`}`,
    detector_dirty: !rev && execSync('git status --porcelain -- src/shared/mail.ts').toString().trim() !== '',
    match: 'exact string match with the label',
    date: new Date().toISOString(),
    command: `node scripts/eval-mail-codes.ts${holdout ? ' --corpus test/fixtures/mail-codes-holdout.jsonl' : ''}${rev ? ` --rev ${rev}` : ''} --write`,
    all: summary(rows),
    ...(holdout ? {} : { dev: summary(rows.filter((r) => r.split === 'dev')), test: summary(rows.filter((r) => r.split === 'test')) }),
    by_category: Object.fromEntries([...new Set(rows.map((r) => r.category))].sort().map((c) => {
      const m = metrics(rows.filter((r) => r.category === c));
      return [c, { n: m.n, tp: m.tp, fp: m.fp, fn: m.fn }];
    })),
    errors: rows.filter((r) => r.outcome === 'fp' || r.outcome === 'fn' || r.outcome === 'wrong').map((r) => ({ id: r.id, split: r.split, category: r.category, outcome: r.outcome, want: r.code, got: r.got })),
  };
  for (const k of ['all', 'dev', 'test'] as const) {
    const s = (report as Record<string, any>)[k];
    if (s) console.log(`${k.padEnd(4)} n=${s.n} positives=${s.positives} precision=${pct(s.precision)} [${s.precision_ci95.map(pct).join(', ')}] recall=${pct(s.recall)} [${s.recall_ci95.map(pct).join(', ')}] tp=${s.tp} fp=${s.fp} fn=${s.fn} wrong=${s.wrong}`);
  }
  if (process.argv.includes('--misses')) for (const r of rows.filter((r) => r.split === 'dev' && r.outcome !== 'tp' && r.outcome !== 'tn')) console.log(`  ${r.outcome.padEnd(5)} ${r.id} [${r.category}] want=${r.code} got=${r.got} :: ${r.subject} | ${r.snippet}`);
  if (process.argv.includes('--write')) {
    mkdirSync(new URL('../docs/evals/', import.meta.url), { recursive: true });
    const tag = rev ? execSync(`git rev-parse --short ${rev}`).toString().trim() : head;
    const file = new URL(`../docs/evals/${report.eval}-${report.date.slice(0, 10)}-${tag}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(report, null, 1) + '\n');
    console.log(`wrote ${file.pathname}`);
  }
}
