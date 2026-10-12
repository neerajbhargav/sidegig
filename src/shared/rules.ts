import type { LinkRule } from './types.ts';

/**
 * Host patterns:
 *   "notion.so"      -> notion.so and any subdomain (www.notion.so)
 *   "*.figma.com"    -> any subdomain of figma.com, and figma.com itself
 *   "github.com/org" -> host plus path prefix
 */
export function matchPattern(pattern: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!p) return false;
  const [hostPart, ...pathParts] = p.split('/');
  const host = u.hostname.toLowerCase();
  const bare = hostPart.replace(/^\*\./, '');
  const hostOk = host === bare || host.endsWith('.' + bare);
  if (!hostOk) return false;
  if (!pathParts.length) return true;
  const path = '/' + pathParts.join('/');
  return u.pathname.toLowerCase().startsWith(path);
}

export function findRule(rules: LinkRule[], url: string): LinkRule | undefined {
  return rules.find((r) => r.enabled && matchPattern(r.pattern, url));
}

export function hostExcluded(excluded: string[], hostname: string): boolean {
  const h = hostname.toLowerCase();
  return excluded.some((e) => {
    const x = e.trim().toLowerCase().replace(/^\*\./, '');
    return !!x && (h === x || h.endsWith('.' + x));
  });
}

/** Pages where extensions can't draw (the rail can't appear there). */
export function isRestricted(url = ''): boolean {
  return (
    !/^(https?|file):/.test(url) ||
    /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons|addons\.opera\.com)/.test(url)
  );
}
