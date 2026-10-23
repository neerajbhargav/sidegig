// Picking the edition: what to search for, how to score what comes back, and
// how to compose a short, varied issue instead of an endless ranked feed.
import type { EdItem, EdKind, Interest, Profile } from './types.ts';
import { ED_KINDS } from './types.ts';
import { tokens, MAX_WEIGHT } from './profile.ts';
import type { Source } from './sources.ts';

const DAY = 86_400_000;

/** How fast each kind goes stale (days to lose half its freshness). */
const HALF_LIFE: Record<EdKind, number> = { read: 7, discuss: 4, watch: 21, podcast: 30, paper: 14, book: Infinity, music: 720 };
/** log10 of the popularity that counts as "very popular" for each source. */
const POP_SCALE: Record<string, number> = { 'Hacker News': 3, YouTube: 6, Reddit: 4, Substack: 2.3, Books: 3 };
/** Sources whose search already matches loosely (album titles rarely say "indie"). */
const LOOSE: Partial<Record<EdKind, number>> = { music: 0.6, watch: 0.34 };

/** Small seeded RNG, so a build is reproducible in tests. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const appliesTo = (i: Interest, kind: EdKind) => (i.kinds?.length ? i.kinds.includes(kind) : kind !== 'music');

/** Your strongest interests every time, plus a rotating pick from the rest so editions don't repeat themselves. */
export function pickTerms(p: Profile, kind: EdKind, n: number, rand: () => number): string[] {
  const pool = p.interests.filter((i) => appliesTo(i, kind)).sort((a, b) => b.weight - a.weight);
  if (pool.length <= n) return pool.map((i) => i.term);
  const fixed = Math.ceil(n * 0.6);
  const out = pool.slice(0, fixed);
  const rest = pool.slice(fixed);
  while (out.length < n && rest.length) {
    const total = rest.reduce((s, i) => s + i.weight, 0);
    let r = rand() * total;
    let k = 0;
    while (k < rest.length - 1 && (r -= rest[k].weight) > 0) k++;
    out.push(rest.splice(k, 1)[0]);
  }
  return out.map((i) => i.term);
}

export interface Query {
  source: Source;
  term: string;
}

export function planQueries(p: Profile, sources: Source[], kinds: Partial<Record<EdKind, boolean>>, seed: number): Query[] {
  const rand = rng(seed);
  const out: Query[] = [];
  for (const s of sources) {
    if (!kinds[s.kind]) continue;
    for (const term of pickTerms(p, s.kind, s.terms, rand)) out.push({ source: s, term });
  }
  return out;
}

const hasPhrase = (hay: Set<string>, phrase: string) => {
  const t = tokens(phrase);
  return t.length > 0 && t.every((x) => hay.has(x));
};

/** 0..1, or null when the item should never be shown. */
export function scoreItem(item: EdItem, p: Profile, now: number): number | null {
  const words = new Set(tokens(`${item.title} ${item.summary ?? ''} ${item.by ?? ''} ${(item.tags ?? []).join(' ')}`));
  if (p.avoid.some((a) => hasPhrase(new Set(tokens(item.title)), a) || hasPhrase(words, a))) return null;
  const interest = p.interests.find((i) => i.term.toLowerCase() === item.topic.toLowerCase());
  const weight = interest?.weight ?? 1;
  const termTokens = tokens(item.topic);
  const hit = termTokens.filter((t) => words.has(t)).length;
  let match = termTokens.length ? hit / termTokens.length : 0;
  const loose = LOOSE[item.kind];
  if (loose !== undefined) match = Math.max(match, loose);
  // "street photography" needs both words: "162 East 36th Street" is not about photography.
  else if (hit < Math.min(2, termTokens.length) || match < 0.5) return null;
  const age = item.published ? Math.max(0, now - item.published) / DAY : undefined;
  const hl = HALF_LIFE[item.kind];
  const fresh = age === undefined ? 0.6 : hl === Infinity ? 1 : 0.5 ** (age / hl);
  const scale = POP_SCALE[item.source];
  const pop = scale && item.pop !== undefined ? Math.min(1, Math.log10(item.pop + 1) / scale) : 0.5;
  const rel = weight / MAX_WEIGHT;
  return (0.35 + 0.65 * rel) * (0.3 + 0.7 * match) * (0.45 + 0.55 * pop) * (0.25 + 0.75 * fresh);
}

export const titleKey = (t: string) => tokens(t).slice(0, 8).join(' ');

const TRACKING = /^(utm_|fbclid$|gclid$|mc_[ce]id$|ref$|ref_src$|si$|oc$|uo$|source$|s$)/i;

/** Same page, ignoring tracking junk. Keeps meaningful queries like YouTube's ?v=. */
export function urlKey(u: string): string {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (TRACKING.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();
    const q = x.searchParams.toString();
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}${q ? `?${q}` : ''}`.toLowerCase();
  } catch {
    return u;
  }
}

/** Score, drop what you've seen/saved/dismissed or asked to avoid, and collapse duplicates. */
export function rankCandidates(items: EdItem[], p: Profile, blocked: Set<string>, now: number): EdItem[] {
  const best = new Map<string, EdItem>();
  const urls = new Set<string>();
  const scored = items
    .filter((i) => !blocked.has(i.id))
    .map((i) => ({ ...i, score: scoreItem(i, p, now) ?? -1 }))
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score! - a.score!);
  for (const i of scored) {
    const key = titleKey(i.title) || i.id;
    const u = urlKey(i.url);
    if (best.has(key) || best.has(i.id) || urls.has(u)) continue;
    best.set(key, i);
    urls.add(u);
  }
  return [...best.values()];
}

/**
 * A short, varied issue: every kind you turned on gets a say, no single topic
 * or source dominates, and the next-best picks are kept in reserve.
 */
export function compose(ranked: EdItem[], size: number, kinds: EdKind[], p?: Profile): { items: EdItem[]; reserve: EdItem[] } {
  // Quality floor: nothing far weaker than the best pick makes the issue just to fill a slot.
  const top = ranked.reduce((m, i) => Math.max(m, i.score ?? 0), 0);
  const remaining = ranked.filter((i) => (i.score ?? 0) >= top * 0.42);
  const weightOf = new Map((p?.interests ?? []).map((i) => [i.term.toLowerCase(), i.weight]));
  const present = kinds.filter((k) => remaining.some((i) => i.kind === k));
  const quota = Math.max(1, Math.ceil(size / Math.max(1, present.length)));
  const topicN = new Map<string, number>();
  const kindN = new Map<EdKind, number>();
  const sourceN = new Map<string, number>();
  const take = (n: number) => {
    const out: EdItem[] = [];
    while (out.length < n && remaining.length) {
      let bi = 0;
      let bv = -1;
      for (let k = 0; k < remaining.length; k++) {
        const c = remaining[k];
        const kn = kindN.get(c.kind) ?? 0;
        // Stronger interests earn more slots before repeats start to cost.
        const share = Math.max(1, (weightOf.get(c.topic.toLowerCase()) ?? 2.5) / 2.5);
        const v =
          c.score! *
          0.55 ** ((topicN.get(c.topic.toLowerCase()) ?? 0) / share) *
          0.8 ** (sourceN.get(c.source) ?? 0) *
          (kn >= quota ? 0.3 : kn === 0 ? 1.3 : 1);
        if (v > bv) {
          bv = v;
          bi = k;
        }
      }
      const c = remaining.splice(bi, 1)[0];
      out.push(c);
      topicN.set(c.topic.toLowerCase(), (topicN.get(c.topic.toLowerCase()) ?? 0) + 1);
      kindN.set(c.kind, (kindN.get(c.kind) ?? 0) + 1);
      sourceN.set(c.source, (sourceN.get(c.source) ?? 0) + 1);
    }
    return out;
  };
  const items = take(size);
  const reserve = take(12);
  return { items, reserve };
}

/** The lead story: the strongest pick that has a picture (it reads better as a front page). */
export function leadOf(items: EdItem[]): EdItem | undefined {
  const best = (xs: EdItem[]) => xs.reduce<EdItem | undefined>((b, i) => (!b || (i.score ?? 0) > (b.score ?? 0) ? i : b), undefined);
  return best(items.filter((i) => i.image && (i.kind === 'read' || i.kind === 'watch'))) ?? best(items.filter((i) => i.image)) ?? items[0];
}

export function groupByKind(items: EdItem[]): [EdKind, EdItem[]][] {
  return ED_KINDS.map((k) => [k, items.filter((i) => i.kind === k)] as [EdKind, EdItem[]]).filter(([, v]) => v.length);
}
