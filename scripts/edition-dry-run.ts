// Builds one edition from live sources in Node, the same way the extension does.
// Usage: node scripts/edition-dry-run.ts [profile.json] > edition.json
import { readFileSync } from 'node:fs';
import { SOURCES } from '../src/shared/edition/sources.ts';
import { planQueries, rankCandidates, compose } from '../src/shared/edition/rank.ts';
import { emptyProfile, parseImport, mergeImport } from '../src/shared/edition/profile.ts';
import { ED_KINDS } from '../src/shared/edition/types.ts';
import { defaultSettings } from '../src/shared/defaults.ts';

const reply = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '';
const imp = parseImport(reply);
if (!imp) throw new Error('pass a file containing an AI reply with the sidegig_profile JSON');
const profile = mergeImport(emptyProfile(), imp, 'dry-run');
const s = defaultSettings().edition;
const now = Date.now();
const queries = planQueries(profile, SOURCES, s.kinds, Math.floor(now / 3_600_000));
const found = [];
const stats: Record<string, { ok: number; fail: number; items: number; ms: number }> = {};
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < queries.length) {
    const q = queries[i++];
    const st = (stats[q.source.id] ??= { ok: 0, fail: 0, items: 0, ms: 0 });
    const t0 = Date.now();
    try {
      const r = await fetch(q.source.url(q.term, now), { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = q.source.parse(await r.text(), q.term, now);
      found.push(...items);
      st.ok++;
      st.items += items.length;
    } catch (e) {
      st.fail++;
      console.error(q.source.id, q.term, String(e).slice(0, 80));
    }
    st.ms += Date.now() - t0;
  }
}));
const ranked = rankCandidates(found, profile, new Set(), now);
const { items, reserve } = compose(ranked, s.size, ED_KINDS.filter((k) => s.kinds[k]), profile);
console.error(JSON.stringify({ queries: queries.length, found: found.length, ranked: ranked.length, stats }));
if (process.env.TOP) for (const k of ED_KINDS) console.error(k, ranked.filter((r) => r.kind === k).slice(0, Number(process.env.TOP)).map((r) => `${r.score!.toFixed(2)} [${r.topic}] ${r.title.slice(0, 50)}`).join('\n   '));
console.log(JSON.stringify({ profile, edition: { id: 'ed_dry', built: now, items, reserve, terms: [...new Set(queries.map((q) => q.term))], errors: [] } }));
