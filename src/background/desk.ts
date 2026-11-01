// Some browsers show their own new tab whatever the override list says. Aside does,
// and it also sends any extension's newtab.html back to its own page (and it doesn't
// say it is Aside). So when your sidegig new tab is on and a finished new tab holds
// someone else's page, it opens the same page as desk.html (a copy the build makes).
import { ext } from '../shared/api.ts';
import { loadSettings } from '../shared/storage.ts';

/** A finished new tab that isn't sidegig's, while sidegig's new tab is on. */
export const takesNewTab = (url: string | undefined, newtabOn: boolean, oursInTab: number) => url === 'chrome://newtab/' && newtabOn && oursInTab === 0;

export function deskOnNewTabs() {
  const getContexts = (ext.runtime as { getContexts?: typeof chrome.runtime.getContexts }).getContexts;
  if (!getContexts) return;
  ext.tabs.onUpdated.addListener(async (tabId, change, tab) => {
    if (change.status !== 'complete' || tab.url !== 'chrome://newtab/') return;
    const ours = await getContexts({ contextTypes: ['TAB' as chrome.runtime.ContextType], tabIds: [tabId] }).catch(() => null);
    if (ours && takesNewTab(tab.url, (await loadSettings()).newtab.enabled, ours.length)) void ext.tabs.update(tabId, { url: ext.runtime.getURL('desk.html') }).catch(() => undefined);
  });
}
