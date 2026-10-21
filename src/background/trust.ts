// Who may send which message. Decided from what the browser reports about the
// sender, never from hosts or URLs named inside the message itself.
import type { ToBackground } from '../shared/messages.ts';

type Sender = { id?: string; url?: string; frameId?: number };

/** Only sidegig's own pages (panel, drawer, new tab, settings) send these. */
const PAGE_ONLY = new Set<ToBackground['type']>(['clear-sw', 'save-workspace', 'restore-workspace', 'sleep-tabs', 'refresh-status', 'edition-build', 'ask-page', 'drawer-frames']);
/** The app-frame helpers send these about the site they run in. */
const SITE = new Set<ToBackground['type']>(['badge', 'ai-claim', 'profile-import', 'frame-cookies']);

export function httpsHost(url = ''): string {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.hostname : '';
  } catch {
    return '';
  }
}

/** `host` is the sender's own https host, for the site messages. */
export function trustSender(type: string, sender: Sender, extId: string, extOrigin: string): { ok: boolean; host: string } {
  const no = { ok: false, host: '' };
  if (sender.id !== extId) return no;
  const fromPage = (sender.url ?? '').startsWith(extOrigin + '/');
  if (PAGE_ONLY.has(type as ToBackground['type'])) return { ok: fromPage, host: '' };
  if (SITE.has(type as ToBackground['type'])) {
    const host = httpsHost(sender.url);
    // Cookies go only to a framed app, never to a site open as a normal page.
    if (!host || fromPage || (type === 'frame-cookies' && !sender.frameId)) return no;
    return { ok: true, host };
  }
  return { ok: true, host: '' };
}
