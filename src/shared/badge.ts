import type { BadgeKind } from './types.ts';

/** Unread state read from a page title. `count` -1 means "unread, no number". */
export interface Badge { count: number }

const num = (s: string) => {
  if (/\+$/.test(s)) return parseInt(s, 10);
  return parseInt(s.replace(/[,.\s]/g, ''), 10);
};

export function parseBadge(title: string, kind: BadgeKind): Badge | null {
  if (kind === 'none' || !title) return null;
  const t = title.trim();
  if (kind === 'gmail') {
    const m = t.match(/\((\d[\d,.]*\+?)\)/);
    return m ? { count: num(m[1]) } : { count: 0 };
  }
  // "(3) WhatsApp", "[12] Telegram", "(99+) X"
  const lead = t.match(/^[([](\d[\d,.]*\+?)[)\]]/);
  if (lead) return { count: num(lead[1]) };
  // Slack-style markers: "! Slack" (mention) / "* Slack" (unread)
  if (/^!\s/.test(t)) return { count: 1 };
  if (/^\*\s/.test(t)) return { count: -1 };
  // "Inbox (5) - ..." anywhere as a last resort
  const any = t.match(/\((\d[\d,.]*\+?)\)/);
  if (any) return { count: num(any[1]) };
  return { count: 0 };
}

export function badgeLabel(count: number): string {
  if (count < 0) return '';
  if (count > 99) return '99+';
  return String(count);
}
