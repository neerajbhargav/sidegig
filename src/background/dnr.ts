// Network rules that let sites load inside sidegig's own panel.
//
// Most sites refuse to be framed (X-Frame-Options / CSP frame-ancestors). We
// remove those two headers ONLY for frames that load inside sidegig's panel,
// never for normal browsing:
//   - session rules scoped to tabId -1 (requests that don't belong to a tab:
//     the browser's side panel / sidebar), and
//   - either initiated by sidegig itself, or going to one of the user's app hosts
//     (or a sign-in host they redirect through).
// "drawer" apps (inside a page) additionally get a rule limited to frames that
// sidegig's own pages initiate.
import type { AppEntry } from '../shared/types.ts';
import { ext } from '../shared/api.ts';

type Rule = chrome.declarativeNetRequest.Rule;

export const AUTH_HOSTS = [
  'accounts.google.com',
  'ogs.google.com',
  'accounts.x.ai',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'auth.openai.com',
  'github.com',
];

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const stripFrameHeaders: chrome.declarativeNetRequest.RuleAction = {
  type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
  responseHeaders: [
    { header: 'x-frame-options', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
    { header: 'content-security-policy', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
    { header: 'content-security-policy-report-only', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
  ],
  // Some servers refuse requests that announce themselves as frames; present
  // the panel's page load like a normal document load instead.
  requestHeaders: [
    { header: 'sec-fetch-dest', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'document' },
    { header: 'sec-fetch-site', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'same-origin' },
  ],
};

export function buildRules(apps: AppEntry[], extensionHost: string, sideTabs: number[] = []): Rule[] {
  const rules: Rule[] = [];
  let id = 1;
  const appHosts = [...new Set(apps.map((a) => hostOf(a.url)).filter(Boolean))];
  const sub = ['sub_frame' as chrome.declarativeNetRequest.ResourceType];
  const trusted = [...new Set([...appHosts, ...AUTH_HOSTS])];

  // 1. Frames sidegig's own pages open (the sidebar panel, the in-page panel).
  rules.push({ id: id++, priority: 1, action: stripFrameHeaders, condition: { resourceTypes: sub, initiatorDomains: [extensionHost] } });
  // 2. Navigations inside those frames: sign-in redirects and in-app links, started by
  //    the app (or its sign-in page) itself. A third-party site embedding these apps
  //    doesn't match, because it isn't one of the initiators.
  if (appHosts.length) {
    rules.push({
      id: id++,
      priority: 1,
      action: stripFrameHeaders,
      condition: { resourceTypes: sub, requestDomains: trusted, initiatorDomains: [extensionHost, ...trusted] },
    });
  }
  // 3. Mobile layout: ask for the phone version, only for frames sidegig shows.
  const mobileHosts = apps.filter((a) => a.mobile).map((a) => hostOf(a.url)).filter(Boolean);
  if (mobileHosts.length) {
    rules.push({
      id: id++,
      priority: 2,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          { header: 'user-agent', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: MOBILE_UA },
          { header: 'sec-ch-ua-mobile', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: '?1' },
          // Skip cached desktop copies so the switch takes effect immediately.
          { header: 'if-none-match', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
        ],
      },
      condition: { resourceTypes: sub, requestDomains: mobileHosts, initiatorDomains: [extensionHost, ...trusted] },
    });
    // 4. sidegig's docked side windows (Gmail, X): the whole window is narrow, so the phone layout fits it.
    if (sideTabs.length) {
      rules.push({
        id: id++,
        priority: 2,
        action: rules[rules.length - 1].action,
        condition: { resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType, 'sub_frame' as chrome.declarativeNetRequest.ResourceType], tabIds: sideTabs, requestDomains: mobileHosts },
      });
    }
  }
  return rules;
}

let lastApps: AppEntry[] = [];
let sideTabs: number[] = [];
/** A docked side window's tab (or none): its pages get the phone layout. */
export async function setSideTabs(ids: number[]): Promise<void> {
  sideTabs = [...new Set(ids)];
  await applyRules(lastApps);
}

export async function applyRules(apps: AppEntry[]): Promise<void> {
  lastApps = apps;
  const dnr = (ext as any).declarativeNetRequest;
  if (!dnr?.updateSessionRules) return;
  const host = new URL(ext.runtime.getURL('/')).hostname;
  const existing = await dnr.getSessionRules();
  await dnr.updateSessionRules({
    // Its own rules only (frame cookies use ids 500 and up).
    removeRuleIds: existing.filter((r: Rule) => r.id < 500 || r.id >= 900).map((r: Rule) => r.id),
    addRules: buildRules(apps, host, sideTabs),
  });
}
