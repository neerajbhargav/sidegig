// Builds the new tab edition in the background: search each source for your
// interests, rank, compose a short issue, store it. No account, no server.
import { ext, uid } from '../shared/api.ts';
import { getLocal, setLocal, loadSettings } from '../shared/storage.ts';
import type { Settings } from '../shared/types.ts';
import type { Edition, EdItem, Profile, SavedItem } from '../shared/edition/types.ts';
import { ED_KINDS } from '../shared/edition/types.ts';
import { SOURCES } from '../shared/edition/sources.ts';
import { planQueries, rankCandidates, compose } from '../shared/edition/rank.ts';
import { decay, sanitizeProfile, parseImport, mergeImport, learnFromSave, matchInterests } from '../shared/edition/profile.ts';

export const ED = {
  profile: 'edProfile',
  edition: 'edition',
  saved: 'edSaved',
  seen: 'edSeen',
  dismissed: 'edDismissed',
  importing: 'edImport',
  status: 'edStatus',
} as const;

export interface EdStatus {
  building: boolean;
  at: number;
  errors: string[];
  /** Set after an import from an AI, so the new tab can say so. */
  imported?: { host: string; count: number; at: number };
}

const TIMEOUT = 12_000;

async function fetchText(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    // Signed out on purpose: results shouldn't depend on (or feed) your accounts' recommendation history.
    const r = await fetch(url, { credentials: 'omit', signal: ctl.signal, headers: { accept: 'application/json, text/html, application/xml;q=0.9, */*;q=0.8' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function loadProfile(): Promise<Profile> {
  return sanitizeProfile(await getLocal(ED.profile, null));
}

let building: Promise<Edition | null> | null = null;

export function buildEdition(): Promise<Edition | null> {
  building ??= run().finally(() => (building = null));
  return building;
}

async function run(): Promise<Edition | null> {
  const s = await loadSettings();
  if (!s.edition.enabled) return null;
  const profile = decay(await loadProfile());
  await setLocal(ED.profile, profile);
  if (!profile.interests.length) return null;
  const prev = await getLocal<EdStatus | null>(ED.status, null);
  await setLocal(ED.status, { ...(prev ?? { errors: [] }), building: true, at: Date.now() });
  const now = Date.now();
  const queries = planQueries(profile, SOURCES, s.edition.kinds, Math.floor(now / 3_600_000));
  const found: EdItem[] = [];
  const errors = new Map<string, string>();
  let ok = 0;
  await pool(queries, 4, async (q) => {
    try {
      found.push(...q.source.parse(await fetchText(q.source.url(q.term, now)), q.term, now));
      ok++;
    } catch (e) {
      errors.set(q.source.label, `${q.source.label}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 90));
    }
  });
  const [seen, dismissed, saved] = await Promise.all([
    getLocal<Record<string, number>>(ED.seen, {}),
    getLocal<Record<string, number>>(ED.dismissed, {}),
    getLocal<SavedItem[]>(ED.saved, []),
  ]);
  // Shown in two editions already, saved, or waved off: don't bring it back.
  const blocked = new Set([...Object.keys(seen).filter((k) => seen[k] >= 2), ...Object.keys(dismissed), ...saved.map((x) => x.id)]);
  const ranked = rankCandidates(found, profile, blocked, now);
  const { items, reserve } = compose(ranked, s.edition.size, ED_KINDS.filter((k) => s.edition.kinds[k]), profile);
  const status: EdStatus = { building: false, at: now, errors: [...errors.values()], imported: prev?.imported };
  if (!items.length && !ok) {
    // Offline or every source failed: keep the last edition rather than blanking the page.
    await setLocal(ED.status, status);
    return null;
  }
  const no = (await getLocal<number>('edCount', 0)) + 1;
  await setLocal('edCount', no);
  const ed: Edition = { id: uid('ed_'), no, built: now, items, reserve, terms: [...new Set(queries.map((q) => q.term))], errors: status.errors };
  await setLocal(ED.edition, ed);
  await setLocal(ED.status, status);
  return ed;
}

/** Keep one repeating alarm. Recreated only when the period changes, so other settings edits don't keep resetting it. */
export async function scheduleEdition(s: Settings) {
  const period = Math.max(60, s.edition.refreshHours * 60);
  const cur = await ext.alarms.get('edition').catch(() => undefined);
  if (!s.edition.enabled) return void (cur && (await ext.alarms.clear('edition')));
  if (cur?.periodInMinutes === period) return;
  ext.alarms.create('edition', { periodInMinutes: period });
}

/** On startup or when the alarm was missed (laptop asleep), build if the edition is stale. */
export async function buildIfStale(s: Settings) {
  if (!s.edition.enabled) return;
  const ed = await getLocal<Edition | null>(ED.edition, null);
  if (!ed || Date.now() - ed.built > s.edition.refreshHours * 3_600_000) void buildEdition();
}

/** Your AI's reply arrived (read back by the bridge): merge it and build a fresh edition. */
export async function importFromAi(text: string, host: string): Promise<{ ok: boolean; count: number }> {
  const pending = await getLocal<{ host: string; at: number } | null>(ED.importing, null);
  if (!pending || pending.host !== host || Date.now() - pending.at > 20 * 60_000) return { ok: false, count: 0 };
  const imp = parseImport(text);
  if (!imp) return { ok: false, count: 0 };
  const p = mergeImport(await loadProfile(), imp, host);
  await setLocal(ED.profile, p);
  await setLocal(ED.importing, null);
  const count = imp.topics.length + imp.music.length + imp.creators.length;
  const st = await getLocal<EdStatus | null>(ED.status, null);
  await setLocal(ED.status, { ...(st ?? { building: false, at: 0, errors: [] }), imported: { host, count, at: Date.now() } });
  void buildEdition();
  return { ok: true, count };
}

const kindOfUrl = (u: string): EdItem['kind'] =>
  /youtube\.com|youtu\.be|vimeo\.com/.test(u) ? 'watch' : /podcasts\.apple|spotify\.com\/episode|overcast/.test(u) ? 'podcast' : /music\.(apple|youtube)|spotify\.com\/(album|track)/.test(u) ? 'music' : /arxiv\.org/.test(u) ? 'paper' : /reddit\.com|news\.ycombinator/.test(u) ? 'discuss' : /openlibrary|goodreads|amazon\.[a-z.]+\/.*dp\//.test(u) ? 'book' : 'read';

/** "Save to your edition" from the right-click menu: your own curation, which also teaches the profile. */
export async function saveLink(url: string, title: string) {
  if (!/^https?:/.test(url)) return;
  const profile = await loadProfile();
  const topic = matchInterests(profile, title)[0]?.term ?? '';
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep empty */
  }
  const item: SavedItem = { id: `url:${url}`, kind: kindOfUrl(url), source: host, title: title || host, url, by: host, topic, savedAt: Date.now() };
  const saved = await getLocal<SavedItem[]>(ED.saved, []);
  if (!saved.some((x) => x.id === item.id || x.url === url)) await setLocal(ED.saved, [item, ...saved].slice(0, 1000));
  await setLocal(ED.profile, learnFromSave(profile, item));
}
