// Status cards: GitHub, Vercel and Gmail. Each uses the user's own token or
// sign-in; nothing goes through a sidegig server (there isn't one).
import { loadSecrets, loadSettings, setLocal } from '../shared/storage.ts';
import type { StatusCard } from '../shared/types.ts';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

function errorCard(id: StatusCard['id'], title: string, url: string, error: string): StatusCard {
  return { id, title, value: '', detail: error, url, items: [], signature: '', error, updatedAt: Date.now() };
}

export async function githubCard(token?: string): Promise<StatusCard> {
  const url = 'https://github.com/notifications';
  if (!token) return errorCard('github', 'GitHub', url, 'Add a token in sidegig settings');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const [nRes, rRes] = await Promise.all([
    fetch('https://api.github.com/notifications?per_page=20', { headers }),
    fetch('https://api.github.com/search/issues?q=is%3Aopen+is%3Apr+review-requested%3A%40me&per_page=10', { headers }),
  ]);
  if (!nRes.ok) return errorCard('github', 'GitHub', url, `GitHub said ${nRes.status}`);
  const notes = (await nRes.json()) as any[];
  const reviews = rRes.ok ? (((await rRes.json()) as any).items as any[]) : [];
  const items = [
    ...reviews.map((r) => ({ title: r.title, meta: `Review requested · ${r.repository_url.split('/').slice(-2).join('/')}`, url: r.html_url, state: 'warn' as const })),
    ...notes.map((n) => ({ title: n.subject?.title ?? 'Notification', meta: `${n.repository?.full_name ?? ''} · ${n.reason}`, url, state: 'ok' as const })),
  ].slice(0, 8);
  return {
    id: 'github',
    title: 'GitHub',
    value: String(notes.length),
    detail: reviews.length ? `${reviews.length} review request${reviews.length === 1 ? '' : 's'}` : 'unread notifications',
    url,
    items,
    signature: [...reviews.map((r) => r.id), ...notes.map((n) => `${n.id}:${n.updated_at}`)].join(','),
    updatedAt: Date.now(),
  };
}

export async function vercelCard(token?: string, teamId?: string): Promise<StatusCard> {
  const url = 'https://vercel.com/dashboard';
  if (!token) return errorCard('vercel', 'Vercel', url, 'Add a token in sidegig settings');
  const q = new URLSearchParams({ limit: '6' });
  if (teamId) q.set('teamId', teamId);
  const res = await fetch(`https://api.vercel.com/v6/deployments?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return errorCard('vercel', 'Vercel', url, `Vercel said ${res.status}`);
  const deployments = (((await res.json()) as any).deployments ?? []) as any[];
  const stateOf = (s: string) => (s === 'READY' ? 'ok' : s === 'ERROR' || s === 'CANCELED' ? 'error' : 'busy') as 'ok' | 'error' | 'busy';
  const latest = deployments[0];
  return {
    id: 'vercel',
    title: 'Vercel',
    value: latest ? latest.state?.toLowerCase() ?? '' : 'none',
    detail: latest ? `${latest.name} · ${ago(latest.created)}` : 'no deployments yet',
    url,
    items: deployments.map((d) => ({
      title: d.name,
      meta: `${(d.state ?? '').toLowerCase()} · ${ago(d.created)}${d.meta?.githubCommitMessage ? ' · ' + d.meta.githubCommitMessage : ''}`,
      url: d.inspectorUrl ?? `https://${d.url}`,
      state: stateOf(d.state),
    })),
    signature: deployments.slice(0, 3).map((d) => `${d.uid}:${d.state}`).join(','),
    updatedAt: Date.now(),
  };
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? '';
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function parseGmailFeed(xml: string): { count: number; entries: { id: string; title: string; from: string; url: string }[] } {
  const count = parseInt(tag(xml, 'fullcount') || '0', 10) || 0;
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const e = m[1];
    return {
      id: tag(e, 'id'),
      title: unescape(tag(e, 'title')) || '(no subject)',
      from: unescape(tag(tag(e, 'author'), 'name')),
      url: unescape(e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? 'https://mail.google.com/'),
    };
  });
  return { count, entries };
}

export async function gmailCard(): Promise<StatusCard> {
  const url = 'https://mail.google.com/mail/u/0/';
  const res = await fetch('https://mail.google.com/mail/u/0/feed/atom', { credentials: 'include' });
  if (!res.ok) return errorCard('gmail', 'Gmail', url, res.status === 401 ? 'Sign in to Gmail in this browser' : `Gmail said ${res.status}`);
  const { count, entries } = parseGmailFeed(await res.text());
  return {
    id: 'gmail',
    title: 'Gmail',
    value: String(count),
    detail: count === 1 ? 'unread email' : 'unread emails',
    url,
    items: entries.slice(0, 6).map((e) => ({ title: e.title, meta: e.from, url: e.url, state: 'ok' as const })),
    signature: entries.map((e) => e.id).join(','),
    updatedAt: Date.now(),
  };
}

export async function refreshStatus(): Promise<StatusCard[]> {
  const [s, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
  const jobs: Promise<StatusCard>[] = [];
  const safe = (id: StatusCard['id'], title: string, url: string, p: () => Promise<StatusCard>) =>
    p().catch((e) => errorCard(id, title, url, String(e?.message ?? e)));
  if (s.status.github) jobs.push(safe('github', 'GitHub', 'https://github.com/notifications', () => githubCard(secrets.githubToken)));
  if (s.status.vercel) jobs.push(safe('vercel', 'Vercel', 'https://vercel.com/dashboard', () => vercelCard(secrets.vercelToken, secrets.vercelTeamId)));
  if (s.status.gmail) jobs.push(safe('gmail', 'Gmail', 'https://mail.google.com/', gmailCard));
  const cards = await Promise.all(jobs);
  await setLocal('status', cards);
  return cards;
}
