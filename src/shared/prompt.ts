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
