// Your interest profile: filled in by your AI (one prompt, read back
// automatically), by you, and by what you save or wave off.
import type { EdKind, EdItem, Interest, InterestFrom, Profile } from './types.ts';
import { ED_KINDS } from './types.ts';

export const MAX_WEIGHT = 5;
const MIN_WEIGHT = 0.5;
/** Interests from your AI or your saves lose half their pull every 60 days unless renewed. */
const HALF_LIFE_DAYS = 60;

export function emptyProfile(): Profile {
  return { interests: [], avoid: [], about: '', decayedAt: Date.now(), updated: 0 };
}

const STOP = new Set(
  'a an and are as at be by for from how i in into is it its of on or that the this to vs what when why with you your my we our new'.split(' '),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export const normTerm = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60);
const same = (a: string, b: string) => normTerm(a).toLowerCase() === normTerm(b).toLowerCase();

const clampW = (w: number) => Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round(w * 10) / 10));

export function addInterest(p: Profile, term: string, weight: number, from: InterestFrom, kinds?: EdKind[]): Profile {
  const t = normTerm(term);
  if (!t) return p;
  const now = Date.now();
  const existing = p.interests.find((i) => same(i.term, t));
  if (existing) {
    existing.weight = clampW(Math.max(existing.weight, weight));
    existing.updated = now;
    // Something you typed yourself stays yours.
    if (from === 'you') existing.from = 'you';
    if (kinds?.length) existing.kinds = kinds;
  } else p.interests.push({ term: t, weight: clampW(weight), from, updated: now, ...(kinds?.length ? { kinds } : {}) });
  p.updated = now;
  return p;
}

export function removeInterest(p: Profile, term: string): Profile {
  p.interests = p.interests.filter((i) => !same(i.term, term));
  p.updated = Date.now();
  return p;
}

/** Interests whose words show up in a title, best match first. */
export function matchInterests(p: Profile, text: string): Interest[] {
  const tk = new Set(tokens(text));
  return p.interests
    .map((i) => {
      const it = tokens(i.term);
      const hit = it.filter((t) => tk.has(t)).length;
      return { i, f: it.length ? hit / it.length : 0 };
    })
    .filter((x) => x.f >= 0.5)
    .sort((a, b) => b.f - a.f || b.i.weight - a.i.weight)
    .map((x) => x.i);
}

/** Saving something pulls its topic up; it's the strongest signal you give. */
export function learnFromSave(p: Profile, item: Pick<EdItem, 'topic' | 'title' | 'summary'>): Profile {
  const now = Date.now();
  const hits = item.topic ? p.interests.filter((i) => same(i.term, item.topic)) : [];
  const targets = hits.length ? hits : matchInterests(p, `${item.title} ${item.summary ?? ''}`).slice(0, 2);
  for (const i of targets) {
    i.weight = clampW(i.weight + 0.5);
    i.updated = now;
  }
  p.updated = now;
  return p;
}

/** Opening something is a weak yes: a small nudge, capped so clicks alone can't run away with the profile. */
export function learnFromOpen(p: Profile, item: Pick<EdItem, 'topic'>): Profile {
  const i = p.interests.find((x) => same(x.term, item.topic));
  if (i && i.weight < 4) {
    i.weight = clampW(i.weight + 0.15);
    i.updated = Date.now();
    p.updated = i.updated;
  }
  return p;
}

/** "Not for me" nudges the topic down a little; it never removes it. */
export function learnFromDismiss(p: Profile, item: Pick<EdItem, 'topic'>): Profile {
  const i = p.interests.find((x) => same(x.term, item.topic));
  if (i) {
    i.weight = clampW(i.weight - 0.3);
    i.updated = Date.now();
    p.updated = i.updated;
  }
  return p;
}

/** Let interests you no longer feed fade, so the edition follows you as you change. */
export function decay(p: Profile, now = Date.now()): Profile {
  const days = (now - (p.decayedAt || now)) / 86_400_000;
  if (days < 0.5) return p;
  const f = 0.5 ** (days / HALF_LIFE_DAYS);
  p.interests = p.interests
    .map((i) => (i.from === 'you' ? i : { ...i, weight: Math.round(i.weight * f * 100) / 100 }))
    .filter((i) => i.from === 'you' || i.weight >= 0.6);
  p.decayedAt = now;
  return p;
}

// ------------------------------------------------------------ AI import

export const IMPORT_MARKER = 'sidegig_profile';

/** The prompt sidegig types into your AI. Its example is deliberately not valid JSON, so only a real reply parses. */
export function importPrompt(): string {
  return [
    'I use sidegig, a private reading list on my browser’s new tab page. Based on what you know about me from memory and our past chats, tell me what I’d genuinely want to read, watch and listen to.',
    '',
    'Reply with only one JSON code block in this shape:',
    '```',
    `{"${IMPORT_MARKER}": 1,`,
    ' "about": <one sentence about me and what I’m working toward>,',
    ' "topics": [{"topic": <2 to 4 word search phrase>, "weight": <1 to 5>}, ...8 to 15 of these],',
    ' "music": [<genres or artists I like>],',
    ' "creators": [<writers, podcasters or channels I follow>],',
    ' "avoid": [<topics I don’t want to see>]}',
    '```',
    'Use short phrases that work as search queries. Leave out anything private or sensitive (health, money, relationships, people I know, my employer’s confidential work).',
  ].join('\n');
}

export interface ImportedProfile {
  about: string;
  topics: { term: string; weight: number }[];
  music: string[];
  creators: string[];
  avoid: string[];
}

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strList = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x))
    .filter((x) => x && !/[<>]/.test(x))
    .slice(0, n);

/** Pull the profile JSON out of an AI reply (code fences, chatter around it, trailing commas). */
export function parseImport(text: string): ImportedProfile | null {
  const at = text.indexOf(IMPORT_MARKER);
  if (at < 0) return null;
  const start = text.lastIndexOf('{', at);
  if (start < 0) return null;
  // Find the matching closing brace, respecting strings.
  let depth = 0;
  let inStr = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  let raw = text.slice(start, end + 1).replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1');
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.topics)) return null;
  const topics = (obj.topics as unknown[])
    .map((t: any) => {
      const term = typeof t === 'string' ? str(t) : str(t?.topic ?? t?.term ?? t?.name);
      const w = Number(typeof t === 'object' ? t?.weight : 3);
      return { term, weight: Number.isFinite(w) ? Math.max(1, Math.min(5, w)) : 3 };
    })
    .filter((t) => t.term && !/[<>]/.test(t.term))
    .slice(0, 25);
  if (topics.length < 2) return null;
  raw = '';
  return {
    about: str(obj.about, 240),
    topics,
    music: strList(obj.music, 8),
    creators: strList(obj.creators, 10),
    avoid: strList(obj.avoid, 20),
  };
}

/** A fresh import replaces what your AI said last time; what you typed and what your saves taught stay. */
export function mergeImport(p: Profile, imp: ImportedProfile, from: string): Profile {
  p.interests = p.interests.filter((i) => i.from !== 'ai');
  for (const t of imp.topics) addInterest(p, t.term, t.weight, 'ai');
  for (const m of imp.music) addInterest(p, m, 3, 'ai', ['music']);
  for (const c of imp.creators) addInterest(p, c, 2.5, 'ai', ['watch', 'podcast', 'book']);
  const avoid = new Map(p.avoid.map((a) => [a.toLowerCase(), a]));
  for (const a of imp.avoid) avoid.set(a.toLowerCase(), a);
  p.avoid = [...avoid.values()].slice(0, 40);
  if (imp.about) p.about = imp.about;
  p.importedFrom = from;
  p.importedAt = Date.now();
  p.updated = p.importedAt;
  return p;
}

export function sanitizeProfile(v: unknown): Profile {
  const p = emptyProfile();
  if (!v || typeof v !== 'object') return p;
  const o = v as Partial<Profile>;
  if (Array.isArray(o.interests))
    p.interests = o.interests
      .filter((i) => i && typeof i.term === 'string' && typeof i.weight === 'number')
      .map((i) => ({
        term: normTerm(i.term),
        weight: clampW(i.weight),
        from: (['you', 'ai', 'saves'] as const).includes(i.from) ? i.from : 'you',
        updated: typeof i.updated === 'number' ? i.updated : Date.now(),
        ...(Array.isArray(i.kinds) ? { kinds: i.kinds.filter((k) => ED_KINDS.includes(k)) } : {}),
      }));
  if (Array.isArray(o.avoid)) p.avoid = o.avoid.filter((a) => typeof a === 'string');
  if (typeof o.about === 'string') p.about = o.about;
  if (typeof o.importedFrom === 'string') p.importedFrom = o.importedFrom;
  if (typeof o.importedAt === 'number') p.importedAt = o.importedAt;
  if (typeof o.decayedAt === 'number') p.decayedAt = o.decayedAt;
  if (typeof o.updated === 'number') p.updated = o.updated;
  return p;
}
