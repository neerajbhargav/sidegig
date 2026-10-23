import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hackerNews, substack, googleNews, youtube, podcasts, music, books, arxiv, reddit, relativeAgo, decodeEntities, SOURCES } from '../src/shared/edition/sources.ts';
import {
  emptyProfile,
  addInterest,
  parseImport,
  mergeImport,
  importPrompt,
  learnFromSave,
  learnFromDismiss,
  learnFromOpen,
  decay,
  tokens,
  sanitizeProfile,
} from '../src/shared/edition/profile.ts';
import { scoreItem, rankCandidates, compose, pickTerms, planQueries, rng, leadOf, titleKey, urlKey } from '../src/shared/edition/rank.ts';
import type { EdItem, EdKind } from '../src/shared/edition/types.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/edition/${f}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-11T15:00:00Z');
const DAY = 86_400_000;

// ---------------------------------------------------------------- parsers (real responses)

test('hacker news: stories with article link, thread and points', () => {
  const items = hackerNews.parse(fx('hn.json'), 'agent evals', NOW);
  assert.equal(items.length, 5);
  for (const i of items) {
    assert.match(i.id, /^hn:\d+$/);
    assert.match(i.discuss!, /news\.ycombinator\.com\/item\?id=/);
    assert.match(i.meta!, /points, .* comments/);
    assert.equal(i.kind, 'read');
    assert.ok(i.published! > 0);
  }
  assert.match(hackerNews.url('agent evals', NOW), /points%3E15/);
});

test('substack: free posts from the last four months, with author and read time', () => {
  const items = substack.parse(fx('substack.json'), 'agent evals', NOW);
  assert.ok(items.length >= 3);
  for (const i of items) {
    assert.ok(i.url.startsWith('https://'));
    assert.ok(i.by);
    assert.ok(NOW - i.published! < 120 * DAY);
  }
  assert.ok(items.some((i) => /min read/.test(i.meta ?? '')));
  // Far in the future, everything is stale.
  assert.equal(substack.parse(fx('substack.json'), 'x', NOW + 400 * DAY).length, 0);
});

test('google news: publisher split out of the title', () => {
  const items = googleNews.parse(fx('gnews.xml'), 'quiet luxury', NOW);
  assert.equal(items.length, 4);
  for (const i of items) {
    assert.ok(i.by && i.by !== 'Google News');
    assert.ok(!i.title.endsWith(` - ${i.by}`), i.title);
    assert.ok(i.url.startsWith('https://news.google.com/'));
  }
});

test('youtube: real results parse; live streams and Shorts are skipped', () => {
  const items = youtube.parse(fx('youtube.html'), 'ai agents evals', NOW);
  assert.equal(items.length, 5);
  assert.ok(items.every((i) => /^yt:[\w-]{11}$/.test(i.id) && i.image?.includes('i.ytimg.com') && i.by));
  assert.ok(!items.some((i) => /LIVE|SHORT/.test(i.id)));
  assert.ok(items[0].pop! > 1000);
  assert.ok(items[0].published! < NOW);
});

test('podcasts and music from the iTunes search API', () => {
  const pods = podcasts.parse(fx('podcasts.json'), 'ai agents', NOW);
  assert.equal(pods.length, 3);
  assert.ok(pods.every((p) => p.url.includes('podcasts.apple.com') && p.by && p.image));
  const albums = music.parse(fx('music.json'), 'telugu indie', NOW);
  assert.ok(albums.length >= 1);
  for (const a of albums) {
    assert.ok(a.url.startsWith('https://music.youtube.com/search?q='));
    assert.equal(a.alt?.label, 'Apple Music');
    assert.ok(a.image?.includes('400x400'));
  }
});

test('books need a cover; papers drop the version; reddit drops NSFW', () => {
  const b = books.parse(fx('openlibrary.json'), 'ai agents', NOW);
  assert.ok(b.every((x) => x.image?.includes('covers.openlibrary.org')));
  assert.ok(!b.some((x) => x.title === 'No cover book'));
  assert.ok(b.some((x) => x.meta === '2019, 4.2★'));
  const p = arxiv.parse(fx('arxiv.xml'), 'agent evaluation', NOW);
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => /^arxiv:\d{4}\.\d{4,5}$/.test(x.id) && x.url.startsWith('https://arxiv.org/abs/') && x.summary));
  const r = reddit.parse(fx('reddit.json'), 'vibe coding', NOW);
  assert.ok(r.length >= 1 && !r.some((x) => x.id === 'rd:nsfw1'));
  assert.ok(r.every((x) => x.url.startsWith('https://www.reddit.com/r/')));
});

test('bad responses parse to nothing instead of throwing', () => {
  for (const s of SOURCES) {
    assert.deepEqual(s.parse('not json <html>', 'x', NOW), [], s.id);
    assert.deepEqual(s.parse('', 'x', NOW), [], s.id);
  }
});

test('relative dates and entities', () => {
  assert.equal(relativeAgo('3 weeks ago', NOW), NOW - 21 * DAY);
  assert.equal(relativeAgo('Streamed 2 days ago', NOW), NOW - 2 * DAY);
  assert.equal(relativeAgo('1 mo ago', NOW), NOW - 30 * DAY);
  assert.equal(relativeAgo('', NOW), undefined);
  assert.equal(decodeEntities('A &amp; B &#39;c&#39; <![CDATA[d]]>'), "A & B 'c' d");
});

// ---------------------------------------------------------------- profile

const REPLY = `Sure! Here's what I know:

\`\`\`json
{"sidegig_profile": 1,
 "about": "Product designer in Springfield who reads about calm interfaces",
 "topics": [{"topic": "agent evals", "weight": 5}, {"topic": "vibe coding", "weight": 4}, {"topic": "quiet luxury menswear", "weight": 3},],
 "music": ["Telugu indie", "Tamil film scores"],
 "creators": ["Naval Ravikant"],
 "avoid": ["crypto"]}
\`\`\`
Let me know if you want changes.`;

test('import: reads the JSON out of a chatty reply (fences, trailing commas)', () => {
  const imp = parseImport(REPLY)!;
  assert.ok(imp);
  assert.deepEqual(imp.topics.map((t) => t.term), ['agent evals', 'vibe coding', 'quiet luxury menswear']);
  assert.deepEqual(imp.music, ['Telugu indie', 'Tamil film scores']);
  assert.deepEqual(imp.avoid, ['crypto']);
  assert.equal(imp.about, 'Product designer in Springfield who reads about calm interfaces', 'about is not cut at 60 chars');
});

test('import: the prompt’s own example never parses (so the bridge can’t read the question as the answer)', () => {
  assert.equal(parseImport(importPrompt()), null);
  // Placeholder text is filtered out, leaving too little to count as a profile.
  assert.equal(parseImport('{"sidegig_profile": 1, "topics": [{"topic": "<2 to 4 word search phrase>", "weight": 3}, {"topic":"x","weight":2}]}'), null);
  assert.equal(parseImport('no profile here'), null);
});

test('import: replaces what the AI said last time, keeps what you typed and what saves taught', () => {
  const p = emptyProfile();
  addInterest(p, 'photography', 4, 'you');
  addInterest(p, 'old ai topic', 3, 'ai');
  addInterest(p, 'from a save', 2, 'saves');
  mergeImport(p, parseImport(REPLY)!, 'claude.ai');
  const terms = p.interests.map((i) => i.term);
  assert.ok(terms.includes('photography') && terms.includes('from a save') && !terms.includes('old ai topic'));
  assert.deepEqual(p.interests.find((i) => i.term === 'Telugu indie')?.kinds, ['music']);
  assert.ok(p.interests.find((i) => i.term === 'Naval Ravikant')?.kinds?.includes('podcast'));
  assert.equal(p.importedFrom, 'claude.ai');
  assert.deepEqual(p.avoid, ['crypto']);
});

test('learning: saves pull a topic up, dismissals nudge it down, opens barely move it', () => {
  const p = emptyProfile();
  addInterest(p, 'agent evals', 3, 'ai');
  learnFromSave(p, { topic: 'agent evals', title: 'x' });
  assert.equal(p.interests[0].weight, 3.5);
  learnFromDismiss(p, { topic: 'agent evals' });
  assert.equal(p.interests[0].weight, 3.2);
  learnFromOpen(p, { topic: 'agent evals' });
  assert.equal(p.interests[0].weight, 3.4);
  // A save with no topic finds interests by title words.
  learnFromSave(p, { topic: '', title: 'New paper on agent evals at scale' });
  assert.ok(p.interests[0].weight > 3.4);
  for (let k = 0; k < 30; k++) learnFromDismiss(p, { topic: 'agent evals' });
  assert.equal(p.interests[0].weight, 0.5, 'never below the floor');
});

test('decay: AI and save interests fade over 60 days, yours stay', () => {
  const p = emptyProfile();
  p.decayedAt = NOW - 60 * DAY;
  addInterest(p, 'mine', 4, 'you');
  addInterest(p, 'ai one', 4, 'ai');
  addInterest(p, 'faint', 1, 'saves');
  decay(p, NOW);
  assert.equal(p.interests.find((i) => i.term === 'mine')!.weight, 4);
  assert.equal(p.interests.find((i) => i.term === 'ai one')!.weight, 2);
  assert.ok(!p.interests.some((i) => i.term === 'faint'), 'faded out');
});

test('sanitize: junk from storage becomes a valid profile', () => {
  const p = sanitizeProfile({ interests: [{ term: ' a  b ', weight: 99, from: 'evil', kinds: ['music', 'nope'] }, { nope: 1 }], avoid: ['x', 3] });
  assert.equal(p.interests.length, 1);
  assert.deepEqual(p.interests[0], { term: 'a b', weight: 5, from: 'you', updated: p.interests[0].updated, kinds: ['music'] });
  assert.deepEqual(p.avoid, ['x']);
  assert.equal(sanitizeProfile(null).interests.length, 0);
});

test('tokens drop stop words and punctuation', () => {
  assert.deepEqual(tokens('How to evaluate AI Agents, in practice!'), ['evaluate', 'ai', 'agents', 'practice']);
});

// ---------------------------------------------------------------- ranking & composition

const item = (o: Partial<EdItem> & { id: string }): EdItem => ({ kind: 'read', source: 'Hacker News', title: o.id, url: `https://e.com/${o.id}`, topic: 'agent evals', published: NOW - DAY, pop: 100, ...o });

test('scoring: off-topic results and avoided topics are dropped; fresher and stronger interests win', () => {
  const p = emptyProfile();
  addInterest(p, 'agent evals', 5, 'you');
  addInterest(p, 'gardening', 1, 'you');
  p.avoid = ['crypto'];
  assert.equal(scoreItem(item({ id: 'a', title: 'Totally unrelated thing' }), p, NOW), null);
  assert.equal(scoreItem(item({ id: 'b', title: 'Agent evals for crypto bots' }), p, NOW), null);
  const fresh = scoreItem(item({ id: 'c', title: 'Agent evals in practice' }), p, NOW)!;
  const stale = scoreItem(item({ id: 'd', title: 'Agent evals in practice', published: NOW - 60 * DAY }), p, NOW)!;
  const weak = scoreItem(item({ id: 'e', title: 'Gardening for beginners', topic: 'gardening' }), p, NOW)!;
  assert.ok(fresh > stale && fresh > weak);
  // Music search matches loosely: album names rarely contain the genre.
  assert.ok(scoreItem(item({ id: 'm', kind: 'music', source: 'Music', title: 'Album Name', topic: 'gardening' }), p, NOW)! > 0);
});

test('ranking: duplicates collapse across sources; seen, saved and dismissed stay out', () => {
  const p = emptyProfile();
  addInterest(p, 'agent evals', 4, 'you');
  const ranked = rankCandidates(
    [
      item({ id: 'hn:1', title: 'Agent evals: a field guide' }),
      item({ id: 'ss:1', source: 'Substack', title: 'Agent Evals — A Field Guide!' }),
      item({ id: 'hn:2', title: 'Agent evals at scale' }),
      item({ id: 'hn:4', title: 'Same link, other agent evals title', url: 'https://e.com/hn:1?utm=x' }),
      item({ id: 'hn:5', title: 'Agent evals for voice agents' }),
    ],
    p,
    new Set(['hn:2']),
    NOW,
  );
  const urls = ranked.map((r) => urlKey(r.url));
  const keys = ranked.map((r) => titleKey(r.title));
  assert.equal(new Set(urls).size, urls.length, 'no two picks share a link');
  assert.equal(new Set(keys).size, keys.length, 'no two picks share a headline');
  assert.ok(ranked.length < 5);
  assert.ok(!ranked.some((r) => r.id === 'hn:2'), 'blocked');
  assert.ok(ranked.some((r) => r.id === 'hn:5'));
});

test('compose: every kind gets a say, no topic dominates, reserve is separate', () => {
  const p = emptyProfile();
  addInterest(p, 'agent evals', 5, 'you');
  addInterest(p, 'vibe coding', 3, 'you');
  const pool: EdItem[] = [];
  for (let k = 0; k < 20; k++) pool.push(item({ id: `r${k}`, title: `Agent evals part ${k}`, pop: 900 - k }));
  pool.push(item({ id: 'v1', kind: 'watch', source: 'YouTube', title: 'Vibe coding live', topic: 'vibe coding', pop: 5000 }));
  pool.push(item({ id: 'p1', kind: 'podcast', source: 'Podcasts', title: 'Vibe coding pod', topic: 'vibe coding' }));
  pool.push(item({ id: 'b1', kind: 'book', source: 'Books', title: 'Vibe coding book', topic: 'vibe coding', published: Date.UTC(2025, 0, 1) }));
  const ranked = rankCandidates(pool, p, new Set(), NOW);
  const kinds: EdKind[] = ['read', 'watch', 'podcast', 'book', 'discuss'];
  const { items, reserve } = compose(ranked, 8, kinds, p);
  assert.equal(items.length, 8);
  for (const k of ['read', 'watch', 'podcast', 'book']) assert.ok(items.some((i) => i.kind === k), `has ${k}`);
  assert.ok(items.filter((i) => i.kind === 'read').length <= 5, 'reading does not swallow the issue');
  assert.ok(!reserve.some((r) => items.includes(r)));
  assert.ok(leadOf(items));
});

test('terms: strongest interests always searched, the rest rotate; music tastes only feed music', () => {
  const p = emptyProfile();
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((t, n) => { addInterest(p, `topic ${t}`, 5 - n * 0.5, 'you'); });
  addInterest(p, 'Telugu indie', 4, 'ai', ['music']);
  const t1 = pickTerms(p, 'read', 4, rng(1));
  const t2 = pickTerms(p, 'read', 4, rng(99));
  assert.deepEqual(t1.slice(0, 3), ['topic a', 'topic b', 'topic c']);
  assert.equal(t1.length, 4);
  assert.deepEqual(pickTerms(p, 'read', 4, rng(1)), t1, 'deterministic for a seed');
  assert.ok(!t1.includes('Telugu indie') && !t2.includes('Telugu indie'));
  assert.deepEqual(pickTerms(p, 'music', 3, rng(1)), ['Telugu indie']);
  const qs = planQueries(p, SOURCES, { read: true, music: true }, 7);
  assert.ok(qs.every((q) => q.source.kind === 'read' || q.source.kind === 'music'));
  assert.ok(qs.filter((q) => q.source.kind === 'music').every((q) => q.term === 'Telugu indie'));
});

test('dedupe keys: tracking params go, meaningful queries stay (every YouTube video is its own page)', () => {
  assert.notEqual(urlKey('https://www.youtube.com/watch?v=aaaaaaaaaaa'), urlKey('https://www.youtube.com/watch?v=bbbbbbbbbbb'));
  assert.equal(urlKey('https://e.com/post/?utm_source=x&ref=hn#top'), urlKey('https://www.e.com/post'));
  assert.notEqual(urlKey('https://podcasts.apple.com/us/podcast/x/id1?i=1&uo=4'), urlKey('https://podcasts.apple.com/us/podcast/x/id1?i=2&uo=4'));
  const p = emptyProfile();
  addInterest(p, 'agent evals', 4, 'you');
  const vids = ['a', 'b', 'c'].map((c) => item({ id: `yt:${c}`, kind: 'watch', source: 'YouTube', title: `Agent evals talk ${c}${c}${c} different`, url: `https://www.youtube.com/watch?v=${c.repeat(11)}` }));
  assert.equal(rankCandidates(vids, p, new Set(), NOW).length, 3);
});
