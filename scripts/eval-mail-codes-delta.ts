// Paired comparison of two findCode versions on the same rows, and the rate of false codes on
// mails that have none. Precision depends on how many mails carry a code (45% in the held-out
// set), so the false-code rate is the number that carries over to a real inbox.
//
// Usage: node scripts/eval-mail-codes-delta.ts [--corpus <jsonl>] [--before <rev>] [--after <rev>] [--write]
//   defaults: the held-out set, --before 279374e (the baseline), --after the working tree
//   --write   save docs/evals/mail-codes-holdout-delta-<date>-<before>-<after>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { findCode } from '../src/shared/mail.ts';
import { HOLDOUT, findCodeAt, loadCodeRows, metrics, scoreRow, type Find, type Scored } from './eval-mail-codes.ts';
import { bootstrap95, round } from './evalstats.ts';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const short = (rev: string) => execSync(`git rev-parse --short ${rev}`).toString().trim();

/** Share of mails without a code on which the detector shows one. */
export const falseCodeRate = (rows: Scored[]) => {
  const neg = rows.filter((r) => !r.code);
  return neg.filter((r) => r.got).length / neg.length;
};

/** Precision a detector with this recall and false-code rate would have if `prevalence` of mails carried a code (an estimate, not a measurement). */
export const precisionAt = (recall: number, fcr: number, prevalence: number) => (recall * prevalence) / (recall * prevalence + fcr * (1 - prevalence));

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const corpus = arg('--corpus') ?? HOLDOUT.pathname;
  const beforeRev = arg('--before') ?? '279374e';
  const afterRev = arg('--after');
  const before = await findCodeAt(beforeRev);
  const after: { find: Find; done: () => void } = afterRev ? await findCodeAt(afterRev) : { find: findCode, done: () => {} };
  const rows = loadCodeRows(corpus);
  const pairs = rows.map((r) => ({ b: scoreRow(r, before.find), a: scoreRow(r, after.find) }));
  before.done();
  after.done();
  const side = (pick: (p: (typeof pairs)[number]) => Scored) => {
    const s = pairs.map(pick);
    const m = metrics(s);
    const neg = s.filter((r) => !r.code);
    return {
      precision: round(m.precision),
      precision_ci95: bootstrap95(s, (x) => metrics(x).precision).map((v) => round(v)),
      recall: round(m.recall),
      recall_ci95: bootstrap95(s, (x) => metrics(x).recall).map((v) => round(v)),
      false_codes: `${neg.filter((r) => r.got).length}/${neg.length}`,
      false_code_rate: round(falseCodeRate(s)),
      false_code_rate_ci95: bootstrap95(neg, (x) => x.filter((r) => r.got).length / x.length).map((v) => round(v)),
      // Derived, not measured: the same recall and false-code rate at a lower share of code mails.
      precision_if_5pct_have_codes: round(precisionAt(m.recall, falseCodeRate(s), 0.05)),
      precision_if_2pct_have_codes: round(precisionAt(m.recall, falseCodeRate(s), 0.02)),
    };
  };
  const delta = (f: (s: Scored[]) => number) => {
    const d = (x: typeof pairs) => f(x.map((p) => p.a)) - f(x.map((p) => p.b));
    return { value: round(d(pairs)), ci95: bootstrap95(pairs, d).map((v) => round(v)) };
  };
  const tag = (rev: string | undefined) => (rev ? short(rev) : `${short('HEAD')}`);
  const report = {
    eval: 'mail-codes-holdout-delta',
    corpus: corpus.replace(/^.*\/(test\/fixtures\/)/, '$1'),
    n: rows.length,
    with_code: rows.filter((r) => r.code).length,
    before: `findCode at ${short(beforeRev)}`,
    after: afterRev ? `findCode at ${short(afterRev)}` : `findCode in the working tree at ${short('HEAD')}`,
    method: 'Same rows for both detectors. Intervals: seeded percentile bootstrap, 10,000 resamples; deltas resample rows in pairs.',
    date: new Date().toISOString(),
    command: `node scripts/eval-mail-codes-delta.ts${arg('--corpus') ? ` --corpus ${arg('--corpus')}` : ''} --before ${beforeRev}${afterRev ? ` --after ${afterRev}` : ''} --write`,
    before_scores: side((p) => p.b),
    after_scores: side((p) => p.a),
    delta_after_minus_before: {
      precision: delta((s) => metrics(s).precision),
      recall: delta((s) => metrics(s).recall),
      false_code_rate: delta(falseCodeRate),
    },
    only_after_right: pairs.filter((p) => p.a.outcome === 'tp' && p.b.outcome !== 'tp').length,
    only_before_right: pairs.filter((p) => p.b.outcome === 'tp' && p.a.outcome !== 'tp').length,
  };
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const ci = (c: number[]) => `[${c.map(pct).join(', ')}]`;
  for (const [k, s] of [['before', report.before_scores], ['after', report.after_scores]] as const)
    console.log(`${k.padEnd(6)} precision=${pct(s.precision)} ${ci(s.precision_ci95)} recall=${pct(s.recall)} ${ci(s.recall_ci95)} false codes=${s.false_codes} (${pct(s.false_code_rate)} ${ci(s.false_code_rate_ci95)})`);
  const d = report.delta_after_minus_before;
  const pts = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;
  console.log(`delta  precision ${pts(d.precision.value)} pts [${d.precision.ci95.map(pts).join(', ')}] recall ${pts(d.recall.value)} pts [${d.recall.ci95.map(pts).join(', ')}] false-code rate ${pts(d.false_code_rate.value)} pts [${d.false_code_rate.ci95.map(pts).join(', ')}]`);
  console.log(`rows only after gets right: ${report.only_after_right}; only before: ${report.only_before_right}`);
  if (process.argv.includes('--write')) {
    mkdirSync(new URL('../docs/evals/', import.meta.url), { recursive: true });
    const file = new URL(`../docs/evals/mail-codes-holdout-delta-${report.date.slice(0, 10)}-${short(beforeRev)}-${tag(afterRev)}.json`, import.meta.url);
    writeFileSync(file, `${JSON.stringify(report, null, 1)}\n`);
    console.log(`wrote ${file.pathname}`);
  }
}
