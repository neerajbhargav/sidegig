// The new tab "edition": a small, finite set of things worth your time, picked
// from your own interests (which your AI can fill in) rather than from what
// keeps people scrolling.

export type EdKind = 'read' | 'watch' | 'podcast' | 'book' | 'paper' | 'discuss' | 'music';

export const ED_KINDS: EdKind[] = ['read', 'watch', 'podcast', 'book', 'paper', 'discuss', 'music'];

export const KIND_LABEL: Record<EdKind, string> = {
  read: 'Read',
  watch: 'Watch',
  podcast: 'Listen',
  book: 'Books',
  paper: 'Papers',
  discuss: 'Discussions',
  music: 'Music',
};

/** Where an interest came from. Only `ai` and `saves` fade over time; yours stay until you remove them. */
export type InterestFrom = 'you' | 'ai' | 'saves';

export interface Interest {
  /** Short search phrase, e.g. "agent evals" or "Telugu indie". */
  term: string;
  /** 0.5 (barely) to 5 (a lot). */
  weight: number;
  from: InterestFrom;
  /** Limit this interest to some kinds (music tastes only make sense for music). */
  kinds?: EdKind[];
  updated: number;
}

export interface Profile {
  interests: Interest[];
  /** Never show things about these. */
  avoid: string[];
  /** One line about you, written by your AI. Used to explain picks. */
  about: string;
  /** Which AI last filled this in, e.g. "claude.ai". */
  importedFrom?: string;
  importedAt?: number;
  decayedAt: number;
  updated: number;
}

export interface EdItem {
  /** Stable across editions, e.g. "hn:46809708". */
  id: string;
  kind: EdKind;
  source: string;
  title: string;
  url: string;
  by?: string;
  image?: string;
  /** Epoch ms. */
  published?: number;
  /** e.g. "524 points · 196 comments". */
  meta?: string;
  summary?: string;
  /** Raw popularity from the source (points, views, upvotes...). */
  pop?: number;
  /** The interest that found it. */
  topic: string;
  /** Extra words used for matching only (book subjects, music genre). */
  tags?: string[];
  /** "Why this for you" (written by on-device AI when available). */
  why?: string;
  /** Where people talk about it (e.g. the Hacker News thread). */
  discuss?: string;
  /** Another place to open it, e.g. Apple Music for an album that opens in YouTube Music. */
  alt?: { label: string; url: string };
  score?: number;
}

export interface Edition {
  id: string;
  built: number;
  items: EdItem[];
  /** Next-best picks, used to fill gaps when you dismiss something. */
  reserve: EdItem[];
  terms: string[];
  /** Set once on-device AI has reviewed the picks. */
  refined?: boolean;
  /** Set once the picks have been counted as seen. */
  counted?: boolean;
  errors: string[];
}

export interface SavedItem extends EdItem {
  savedAt: number;
}
