// Small fuzzy matcher for the command palette. Every query word must appear in
// order (as a subsequence) in the text; contiguous runs, word starts and exact
// substrings score higher; long texts and gaps score lower.

const isBoundary = (text: string, i: number) => i === 0 || /[\s\-_./:|·]/.test(text[i - 1]) || (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i]));

function scoreWord(word: string, text: string, lower: string): number | null {
  if (!word) return 0;
  const idx = lower.indexOf(word);
  if (idx >= 0) {
    // Exact substring: best when it starts a word or the whole text.
    let s = 100 + word.length * 6;
    if (idx === 0) s += 40;
    else if (isBoundary(text, idx)) s += 25;
    return s - Math.min(idx, 30) * 0.5;
  }
  let s = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of word) {
    const found = lower.indexOf(ch, ti);
    if (found < 0) return null;
    s += 8;
    if (found === prev + 1) s += 10;
    if (isBoundary(text, found)) s += 12;
    s -= Math.min(found - ti, 12) * 0.8;
    prev = found;
    ti = found + 1;
  }
  return s;
}

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (!text) return null;
  const lower = text.toLowerCase();
  let total = 0;
  for (const word of q.split(/\s+/)) {
    const s = scoreWord(word, text, lower);
    if (s === null) return null;
    total += s;
  }
  return total - Math.min(text.length, 200) * 0.05;
}

export interface Ranked<T> { item: T; score: number }

/**
 * Rank items by their best-matching field. Weights let titles beat URLs.
 */
export function rank<T>(items: T[], query: string, fields: (item: T) => [string, number][], limit = 50): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    let best: number | null = null;
    for (const [text, weight] of fields(item)) {
      const s = fuzzyScore(query, text);
      if (s !== null && (best === null || s * weight > best)) best = s * weight;
    }
    if (best !== null) out.push({ item, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
