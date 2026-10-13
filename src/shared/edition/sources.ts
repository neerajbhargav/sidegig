// Free, keyless sources. Each one turns an interest into a search URL and the
// response into items. Parsers are pure so they're tested against saved
// real responses (test/fixtures/edition).
import type { EdItem, EdKind } from './types.ts';

export interface Source {
  id: string;
  kind: EdKind;
  label: string;
  /** How many interests to search per build (some sources are heavier than others). */
  terms: number;
  url(term: string, now: number): string;
  parse(raw: string, term: string, now: number): EdItem[];
}

const enc = encodeURIComponent;
const DAY = 86_400_000;

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const stripTags = (s: string) => decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s || undefined);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));
const dateMs = (s: unknown) => {
  const t = typeof s === 'number' ? s : Date.parse(String(s ?? ''));
  return Number.isFinite(t) && t > 0 ? t : undefined;
};
const json = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** "3 weeks ago", "Streamed 2 days ago", "1 mo ago" -> epoch ms (approximate). */
export function relativeAgo(text: string | undefined, now: number): number | undefined {
  const m = text?.match(/(\d+)\s*(second|sec|minute|min|hour|hr|day|week|wk|month|mo|year|yr)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const unit = u.startsWith('s') ? 1e3 : u.startsWith('mi') ? 6e4 : u.startsWith('h') ? 36e5 : u.startsWith('d') ? DAY : u.startsWith('w') ? 7 * DAY : u.startsWith('mo') ? 30 * DAY : 365 * DAY;
  return now - n * unit;
}

// ---------------------------------------------------------------- Read

/** Hacker News stories from the last month with some traction. Links go to the article; the thread is kept too. */
export const hackerNews: Source = {
  id: 'hn',
  kind: 'read',
  label: 'Hacker News',
  terms: 6,
  url: (term, now) =>
    `https://hn.algolia.com/api/v1/search?query=${enc(term)}&tags=story&hitsPerPage=20&numericFilters=${enc(`created_at_i>${Math.floor((now - 30 * DAY) / 1000)},points>15`)}`,
  parse(raw, term) {
    const d = json(raw);
    return (d?.hits ?? [])
      .filter((h: any) => h?.title && h.objectID)
      .map((h: any): EdItem => {
        const thread = `https://news.ycombinator.com/item?id=${h.objectID}`;
        const url = h.url || thread;
        return {
          id: `hn:${h.objectID}`,
          kind: 'read',
          source: 'Hacker News',
          title: decodeEntities(h.title),
          url,
          by: host(url) || 'news.ycombinator.com',
          published: dateMs(h.created_at),
          meta: `${num(h.points ?? 0)} points, ${num(h.num_comments ?? 0)} comments`,
          pop: h.points ?? 0,
          topic: term,
          discuss: thread,
        };
      });
  },
};

/** Substack essays: long-form writing by people, not newsrooms. */
export const substack: Source = {
  id: 'substack',
  kind: 'read',
  label: 'Substack',
  terms: 5,
  url: (term) => `https://substack.com/api/v1/post/search?query=${enc(term)}&page=0&includePlatformResults=true`,
  parse(raw, term, now) {
    const d = json(raw);
    return (d?.results ?? [])
      .filter((r: any) => r?.title && r.canonical_url && r.audience !== 'only_paid' && (r.type === 'newsletter' || !r.type))
      .filter((r: any) => (dateMs(r.post_date) ?? 0) > now - 120 * DAY)
      .map((r: any): EdItem => {
        const mins = r.wordcount ? Math.max(1, Math.round(r.wordcount / 230)) : 0;
        return {
          id: `ss:${r.id}`,
          kind: 'read',
          source: 'Substack',
          title: decodeEntities(r.title),
          url: r.canonical_url,
          by: r.publishedBylines?.[0]?.name ?? host(r.canonical_url),
          image: typeof r.cover_image === 'string' ? r.cover_image : undefined,
          published: dateMs(r.post_date),
          summary: clip(r.subtitle ? decodeEntities(r.subtitle) : r.description, 180),
          meta: [mins ? `${mins} min read` : '', r.reaction_count ? `${num(r.reaction_count)} likes` : ''].filter(Boolean).join(', '),
          pop: (r.reaction_count ?? 0) + (r.comment_count ?? 0) * 2,
          topic: term,
        };
      });
  },
};

/** Recent reporting from Google News (search RSS, no account). */
/** Press-release wires read like news but are ads. */
const WIRES = /newswire|presswire|business ?wire|accesswire|prweb|globe ?newswire|send2press|openPR/i;

export const googleNews: Source = {
  id: 'gnews',
  kind: 'read',
  label: 'News',
  terms: 4,
  url: (term) => `https://news.google.com/rss/search?q=${enc(`${term} when:7d`)}&hl=en-US&gl=US&ceid=US:en`,
  parse(raw, term) {
    const items = raw.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return items.slice(0, 20).filter((it) => !WIRES.test(tag(it, 'source'))).map((it, i): EdItem => {
      const src = stripTags(tag(it, 'source'));
      let title = stripTags(tag(it, 'title'));
      if (src && title.endsWith(` - ${src}`)) title = title.slice(0, -(src.length + 3));
      const link = stripTags(tag(it, 'link'));
      const guid = stripTags(tag(it, 'guid')) || `${term}:${i}`;
      return {
        id: `gn:${guid.slice(-40)}`,
        kind: 'read',
        source: 'News',
        title,
        url: link,
        by: src || 'Google News',
        published: dateMs(stripTags(tag(it, 'pubDate'))),
        topic: term,
      };
    });
  },
};

// ---------------------------------------------------------------- Watch

/** YouTube search, uploads from this month only, read from the public results page (signed out). */
export const youtube: Source = {
  id: 'youtube',
  kind: 'watch',
  label: 'YouTube',
  terms: 4,
  url: (term) => `https://www.youtube.com/results?search_query=${enc(term)}&sp=EgQIBBAB`,
  parse(raw, term, now) {
    const m = raw.match(/var ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s) ?? raw.match(/ytInitialData"\]\s*=\s*(\{.*?\});\s*<\/script>/s);
    const data = m ? json(m[1]) : null;
    if (!data) return [];
    const out: EdItem[] = [];
    const walk = (o: any) => {
      if (!o || typeof o !== 'object' || out.length >= 25) return;
      if (o.videoRenderer) {
        const v = o.videoRenderer;
        const len = v.lengthText?.simpleText as string | undefined;
        const title = v.title?.runs?.map((r: any) => r.text).join('') ?? v.title?.simpleText;
        // Skip live streams, premieres and Shorts (no length, or under a minute).
        if (!v.videoId || !title || !len || /^0:\d\d$/.test(len) || v.badges?.some((b: any) => /LIVE/.test(b?.metadataBadgeRenderer?.style ?? ''))) return;
        const views = Number(String(v.viewCountText?.simpleText ?? '').replace(/[^\d]/g, '')) || 0;
        const when = v.publishedTimeText?.simpleText as string | undefined;
        out.push({
          id: `yt:${v.videoId}`,
          kind: 'watch',
          source: 'YouTube',
          title,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          by: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text,
          // hq720 is what YouTube's own results use (sharp enough for the lead story).
          image: `https://i.ytimg.com/vi/${v.videoId}/hq720.jpg`,
          published: relativeAgo(when, now),
          meta: [len, views ? `${num(views)} views` : '', when?.replace(/^Streamed /, '')].filter(Boolean).join(', '),
          pop: views,
          topic: term,
        });
        return;
      }
      for (const k in o) walk(o[k]);
    };
    walk(data);
    return out;
  },
};

// ---------------------------------------------------------------- Listen

export const podcasts: Source = {
  id: 'podcasts',
  kind: 'podcast',
  label: 'Podcasts',
  terms: 4,
  url: (term) => `https://itunes.apple.com/search?term=${enc(term)}&media=podcast&entity=podcastEpisode&limit=25`,
  parse(raw, term) {
    const d = json(raw);
    return (d?.results ?? [])
      .filter((r: any) => r?.trackName && r.trackViewUrl)
      .map((r: any): EdItem => {
        const mins = r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : 0;
        return {
          id: `pod:${r.trackId}`,
          kind: 'podcast',
          source: 'Podcasts',
          title: decodeEntities(r.trackName),
          url: r.trackViewUrl,
          by: r.collectionName,
          image: r.artworkUrl600 ?? r.artworkUrl160,
          published: dateMs(r.releaseDate),
          summary: clip(r.description ? stripTags(r.description) : undefined, 180),
          meta: mins ? `${mins} min` : undefined,
          topic: term,
        };
      });
  },
};

/** Albums by genre or artist. Opens in YouTube Music, with Apple Music as the alternative. */
export const music: Source = {
  id: 'music',
  kind: 'music',
  label: 'Music',
  terms: 3,
  url: (term) => `https://itunes.apple.com/search?term=${enc(term)}&media=music&entity=album&limit=25`,
  parse(raw, term) {
    const d = json(raw);
    return (d?.results ?? [])
      .filter((r: any) => r?.collectionName && r.artistName && (r.trackCount ?? 2) > 1)
      .map((r: any): EdItem => {
        const year = String(r.releaseDate ?? '').slice(0, 4);
        return {
          id: `album:${r.collectionId}`,
          kind: 'music',
          source: 'Music',
          title: decodeEntities(r.collectionName),
          url: `https://music.youtube.com/search?q=${enc(`${r.artistName} ${r.collectionName}`)}`,
          alt: r.collectionViewUrl ? { label: 'Apple Music', url: r.collectionViewUrl } : undefined,
          by: r.artistName,
          image: typeof r.artworkUrl100 === 'string' ? r.artworkUrl100.replace('100x100bb', '400x400bb') : undefined,
          published: dateMs(r.releaseDate),
          meta: [r.primaryGenreName, year].filter(Boolean).join(', '),
          topic: term,
          tags: r.primaryGenreName ? [r.primaryGenreName] : undefined,
        };
      });
  },
};

// ---------------------------------------------------------------- Books & papers

/** Open Library, most-read first, only books with a cover (a decent signal of a real edition). */
export const books: Source = {
  id: 'books',
  kind: 'book',
  label: 'Open Library',
  terms: 4,
  url: (term) =>
    `https://openlibrary.org/search.json?q=${enc(term)}&sort=readinglog&limit=20&fields=key,title,author_name,first_publish_year,cover_i,edition_count,want_to_read_count,ratings_average,ratings_count,subject`,
  parse(raw, term) {
    const d = json(raw);
    return (d?.docs ?? [])
      // A cover and some readers: otherwise niche searches surface self-published filler.
      .filter((b: any) => b?.title && b.key && b.cover_i && (b.want_to_read_count ?? 0) + (b.ratings_count ?? 0) * 2 + (b.edition_count ?? 0) >= 8)
      .map((b: any): EdItem => {
        const rating = b.ratings_count >= 3 && b.ratings_average ? `${b.ratings_average.toFixed(1)}★` : '';
        return {
          id: `ol:${b.key}`,
          kind: 'book',
          source: 'Books',
          title: decodeEntities(b.title),
          url: `https://openlibrary.org${b.key}`,
          by: b.author_name?.[0],
          image: `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`,
          published: b.first_publish_year ? Date.UTC(b.first_publish_year, 0, 1) : undefined,
          meta: [b.first_publish_year, rating].filter(Boolean).join(', '),
          pop: (b.want_to_read_count ?? 0) + (b.edition_count ?? 0) * 3,
          topic: term,
          tags: Array.isArray(b.subject) ? b.subject.slice(0, 25) : undefined,
        };
      });
  },
};

export const arxiv: Source = {
  id: 'arxiv',
  kind: 'paper',
  label: 'arXiv',
  terms: 3,
  url: (term) => `https://export.arxiv.org/api/query?search_query=${enc(`all:"${term}"`)}&sortBy=submittedDate&sortOrder=descending&max_results=15`,
  parse(raw, term) {
    const entries = raw.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    return entries.map((e): EdItem => {
      const abs = stripTags(tag(e, 'id'));
      const id = abs.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
      const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => stripTags(m[1]));
      return {
        id: `arxiv:${id}`,
        kind: 'paper',
        source: 'arXiv',
        title: stripTags(tag(e, 'title')),
        url: `https://arxiv.org/abs/${id}`,
        by: authors.length > 1 ? `${authors[0]} et al.` : authors[0],
        published: dateMs(stripTags(tag(e, 'published'))),
        summary: clip(stripTags(tag(e, 'summary')), 200),
        meta: authors.length ? `${authors.length} author${authors.length > 1 ? 's' : ''}` : undefined,
        topic: term,
      };
    });
  },
};

// ---------------------------------------------------------------- Discuss

export const reddit: Source = {
  id: 'reddit',
  kind: 'discuss',
  label: 'Reddit',
  terms: 4,
  url: (term) => `https://www.reddit.com/search.json?q=${enc(term)}&sort=top&t=week&limit=25&raw_json=1`,
  parse(raw, term) {
    const d = json(raw);
    return (d?.data?.children ?? [])
      .map((c: any) => c?.data)
      .filter((p: any) => p?.title && p.permalink && !p.over_18 && !p.stickied && (p.ups ?? 0) >= 20)
      .map((p: any): EdItem => ({
        id: `rd:${p.id}`,
        kind: 'discuss',
        source: 'Reddit',
        title: decodeEntities(p.title),
        url: `https://www.reddit.com${p.permalink}`,
        by: `r/${p.subreddit}`,
        image: /^https:\/\//.test(p.thumbnail ?? '') ? p.thumbnail : undefined,
        published: p.created_utc ? p.created_utc * 1000 : undefined,
        summary: clip(p.selftext, 180),
        meta: `${num(p.ups ?? 0)} upvotes, ${num(p.num_comments ?? 0)} comments`,
        pop: p.ups ?? 0,
        topic: term,
      }));
  },
};

export const SOURCES: Source[] = [hackerNews, substack, googleNews, youtube, podcasts, books, arxiv, reddit, music];

/** X has no free API, so posts on X are offered as live searches you open in the sidebar. */
export const xSearchUrl = (term: string) => `https://x.com/search?q=${enc(term)}&f=top`;
