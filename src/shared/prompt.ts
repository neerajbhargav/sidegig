export interface PromptInput {
  template: string;
  text: string;
  title: string;
  url: string;
  maxChars: number;
}

const TRUNCATED = '\n[truncated]';

/** Collapse whitespace and drop repeated lines (menus, footers echoed twice). */
export function cleanText(raw: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of raw.split(/\n+/)) {
    const l = line.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (!l) continue;
    const key = l.toLowerCase();
    if (l.length < 120 && seen.has(key)) continue;
    seen.add(key);
    lines.push(l);
  }
  return lines.join('\n');
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  const cut = text.slice(0, Math.max(0, maxChars - TRUNCATED.length));
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return (lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd() + TRUNCATED;
}

export function buildPrompt({ template, text, title, url, maxChars }: PromptInput): string {
  const body = truncate(cleanText(text), maxChars);
  return template
    .replaceAll('{text}', body)
    .replaceAll('{title}', title.trim())
    .replaceAll('{url}', url)
    .trim();
}

// Untrusted text (pages, emails, tab titles) goes to the model inside <page>
// and <email> wrappers. These two make it harder for that text to close a
// wrapper early or fake one, or a system, user or tool turn, or a chat-template
// token. The wrapper is a prompt convention, not a hard boundary.
//
// First NFKC folds lookalikes (fullwidth ＜, small ﹤, fullwidth letters) to
// ASCII, and format characters (zero-width space, word joiner, soft hyphen,
// BOM, bidi marks) are dropped, so "<​/page>" cannot hide a tag.
const FORMAT = /\p{Cf}/gu;
const OPEN = '[<‹〈⟨]';
const TAGS = 'page|email|system|user|assistant|tool\\w*|instructions?|start_of_turn|end_of_turn|sys';
const STRUCTURE = new RegExp(`${OPEN}(?=\\s*\\/?\\s*(?:${TAGS})\\b)|${OPEN}(?=\\|)|\\[(?=\\s*\\/?\\s*INST\\s*\\])`, 'giu');
const fold = (s: string) => s.normalize('NFKC').replace(FORMAT, '');

/** Untrusted text with its wrapper-like tags written as `&lt;page>` (and `[INST]` as `&#91;INST]`), so they read as text. */
export const neutralize = (s: string) => fold(s).replace(STRUCTURE, (m) => (m === '[' ? '&#91;' : '&lt;'));

/** A value for a wrapper attribute: one line, no quotes or angle brackets. */
export const attr = (s: string) => fold(s).replace(/["<>‹›〈〉⟨⟩]/g, '').replace(/\s+/g, ' ').trim();
