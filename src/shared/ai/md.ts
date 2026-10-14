// Markdown for chat replies, safe by construction: everything is escaped
// first, then a small set of formatting is added back. Only http(s) links.
// Handles half-written text while it streams (an open code fence renders as code).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LINK = 'target="_blank" rel="noopener noreferrer"';

export function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c: string) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a href="${u}" ${LINK}>${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'])/g, (_, pre: string, u: string) => `${pre}<a href="${u}" ${LINK}>${u}</a>`);
  s = s.replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\W)__(?=\S)([^_]+?)__(?=\W|$)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|\W)_(?=\S)([^_\n]+?)_(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([^~]+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
}

const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const isTableSep = (l: string) => l.includes('-') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const startsBlock = (l: string, next?: string) => FENCE.test(l) || /^#{1,6}\s/.test(l) || LIST.test(l) || /^\s*>/.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || (l.includes('|') && !!next && isTableSep(next));

export function md(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(FENCE);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${fence[2] ? ` data-lang="${esc(fence[2])}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const hd = l.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (hd) {
      // Chat-sized headings: # is h3, ## h4, the rest h5.
      const lv = Math.min(5, hd[1].length + 2);
      out.push(`<h${lv}>${inline(hd[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const li = l.match(LIST);
    if (li) {
      const base = li[1].length;
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const first = m[3];
        const sub: string[] = [];
        i++;
        while (i < lines.length && (lines[i].trim() === '' ? i + 1 < lines.length && (lines[i + 1].match(/^(\s*)/)![1].length > base) : lines[i].match(/^(\s*)/)![1].length > base)) sub.push(lines[i++].slice(Math.min(base + 2, lines[i - 1].length - lines[i - 1].trimStart().length)));
        items.push(`<li>${inline(first)}${sub.length ? md(sub.join('\n')) : ''}</li>`);
        while (i < lines.length && !lines[i].trim() && lines[i + 1]?.match(LIST)?.[1].length === base) i++;
      }
      const start = ordered ? parseInt(li[2], 10) : 1;
      out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}
