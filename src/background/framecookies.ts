// Cookies for apps shown inside sidegig's frames.
//
// In the sidebar a site is "embedded" in sidegig's page, so the browser leaves out
// its same-site cookies (SameSite=Lax/Strict, or unset). Many apps need one: X's
// ct0 anti-forgery token, for one. These rules add those cookies back, only to
// requests the site makes from inside sidegig's own frames (the browser's side
// panel, whose requests belong to no tab, and sidegig pages open in a tab). The
// frame's first load is left alone: sidegig starts it and the browser treats it
// as same-site already. The user's cookies
// themselves are never changed, and normal browsing is untouched.
import { ext } from '../shared/api.ts';
import type { AppEntry } from '../shared/types.ts';

type Rule = chrome.declarativeNetRequest.Rule;
const FIRST = 500;
const LAST = 699;
const TYPES = ['sub_frame', 'xmlhttprequest', 'script', 'image', 'media', 'font', 'stylesheet', 'websocket', 'ping', 'other'] as chrome.declarativeNetRequest.ResourceType[];

let apps: AppEntry[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const hostOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.hostname : '';
  } catch {
    return '';
  }
};

/** Same-site cookies the browser won't send from inside a frame. */
async function sameSiteCookies(host: string): Promise<chrome.cookies.Cookie[]> {
  const ck = (ext as any).cookies;
  if (!ck?.getAll) return [];
  const all: chrome.cookies.Cookie[] = await ck.getAll({ url: `https://${host}/` }).catch(() => []);
  return all.filter((c) => c.sameSite !== 'no_restriction' && !(c as { partitionKey?: unknown }).partitionKey);
}

/** The ones a page may read itself (not HttpOnly), as "a=1; b=2" for the frame helper. */
export async function pageCookies(url: string): Promise<string> {
  const host = hostOf(url);
  if (!host) return '';
  return (await sameSiteCookies(host)).filter((c) => !c.httpOnly).map((c) => `${c.name}=${c.value}`).join('; ');
}

async function sync() {
  const dnr = (ext as any).declarativeNetRequest;
  if (!dnr?.updateSessionRules) return;
  const own = ext.runtime.getURL('');
  const tabs = (await ext.tabs.query({}).catch(() => [] as chrome.tabs.Tab[])).filter((t) => (t.url ?? '').startsWith(own) && t.id !== undefined).map((t) => t.id!);
  const hosts = [...new Set(apps.map((a) => hostOf(a.url)).filter(Boolean))].slice(0, LAST - FIRST);
  const rules: Rule[] = [];
  for (const [i, host] of hosts.entries()) {
    const cookies = await sameSiteCookies(host);
    if (!cookies.length) continue;
    rules.push({
      id: FIRST + i,
      priority: 3,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [{ header: 'cookie', operation: 'append' as chrome.declarativeNetRequest.HeaderOperation, value: cookies.map((c) => `${c.name}=${c.value}`).join('; ') }],
      },
      // Not the frame's first load: sidegig starts that one, and the browser already
      // treats it as same-site (sending these again would duplicate them).
      condition: { requestDomains: [host], tabIds: [-1, ...tabs], resourceTypes: TYPES, excludedInitiatorDomains: [new URL(own).hostname] },
    });
  }
  const existing: Rule[] = await dnr.getSessionRules();
  await dnr.updateSessionRules({ removeRuleIds: existing.filter((r) => r.id >= FIRST && r.id <= LAST).map((r) => r.id), addRules: rules }).catch(() => undefined);
}

export function scheduleFrameCookies(next?: AppEntry[]) {
  if (next) apps = next;
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), 400);
}

/** Keep the rules current as cookies change and sidegig pages open in tabs. */
export function watchFrameCookies() {
  const ck = (ext as any).cookies;
  ck?.onChanged?.addListener((ch: { cookie: chrome.cookies.Cookie }) => {
    const d = ch.cookie.domain.replace(/^\./, '');
    if (apps.some((a) => {
      const h = hostOf(a.url);
      return h === d || h.endsWith(`.${d}`);
    })) scheduleFrameCookies();
  });
  const own = ext.runtime.getURL('');
  ext.tabs.onUpdated.addListener((_id, info) => info.url?.startsWith(own) && scheduleFrameCookies());
}
