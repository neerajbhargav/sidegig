// A short first-run setup, using the same settings as the rest of the extension.
import { ext } from '../shared/api.ts';
import { appFromCatalog } from '../shared/defaults.ts';
import { saveSettings, setLocal } from '../shared/storage.ts';
import type { Settings } from '../shared/types.ts';
import { h, ico, appFavicon } from '../ui/dom.ts';
import { seg, toggle } from '../ui/views/quick.ts';

export function welcomeView(settings: Settings): HTMLElement {
  const draft = structuredClone(settings);
  const previewApps = h('div', { class: 'welcome-preview-apps' });
  const preview = h('div', { class: 'welcome-preview', 'aria-hidden': 'true', dataset: { side: draft.rail.side } },
    h('div', { class: 'welcome-browser' }, h('i'), h('i'), h('i'), h('span', {}, 'A little more room to focus')),
    h('div', { class: 'welcome-preview-page' }, h('span', {}, 'Your browser, with everything close.'), h('div'), h('div'), h('div')),
    previewApps,
  );
  const paint = () => previewApps.replaceChildren(ico('logo', 22), ...draft.apps.slice(0, 6).map((app) => appFavicon(app, 'fav')), ico('plus', 20));
  paint();
  const apps = h('div', { class: 'welcome-apps', role: 'group', 'aria-label': 'Pinned apps' });
  for (const id of ['gmail', 'whatsapp', 'chatgpt', 'claude', 'gemini', 'telegram', 'notion', 'spotify', 'ytmusic']) {
    const app = appFromCatalog(id);
    const button = h('button', { type: 'button', class: 'welcome-app', 'aria-pressed': String(draft.apps.some((a) => a.catalogId === id)), onclick: () => {
      const selected = draft.apps.some((a) => a.catalogId === id);
      draft.apps = selected ? draft.apps.filter((a) => a.catalogId !== id) : [...draft.apps, app];
      button.setAttribute('aria-pressed', String(!selected));
      paint();
    } }, appFavicon(app, 'fav sm'), h('span', { class: 'welcome-app-name' }, app.name), h('span', { class: 'welcome-app-check' }, ico('check', 16)));
    apps.append(button);
  }
  const status = h('p', { class: 'welcome-status', role: 'status', 'aria-live': 'polite' });
  const start = h('button', { class: 'btn primary welcome-start', type: 'button', onclick: async () => {
    start.disabled = true;
    status.textContent = 'Saving your setup…';
    try {
      await saveSettings(draft);
      try {
        if (draft.newtab.enabled) localStorage.removeItem('sidegig.ntOff');
        else localStorage.setItem('sidegig.ntOff', '1');
      } catch { /* storage can be unavailable in private browsing */ }
      await setLocal('ntChoiceMade', true);
      if (draft.newtab.enabled) location.href = ext.runtime.getURL('newtab.html');
      else location.hash = '#rail';
    } catch {
      status.textContent = 'Your setup could not be saved. Try again.';
      start.disabled = false;
    }
  } }, 'Start using sidegig');
  return h('main', { class: 'welcome' },
    h('header', { class: 'welcome-brand' }, h('img', { src: 'icons/32.png', width: 28, height: 28, alt: '' }), h('b', {}, 'sidegig'), h('a', { href: '#appearance' }, 'All settings')),
    h('div', { class: 'welcome-layout' },
      h('section', { class: 'welcome-story' }, h('span', { class: 'welcome-eyebrow' }, 'Welcome to your sidebar'), h('h1', {}, 'Your apps.\nOne sidebar.'), h('p', {}, 'Keep your apps, bookmarks and daily tools close while you browse. No account to create.'), preview,
        h('p', { class: 'welcome-hint' }, ico('sidebar', 18), 'The rail appears on web pages. Use the toolbar button on browser settings and other protected pages.')),
      h('section', { class: 'welcome-setup', 'aria-label': 'Set up sidegig' },
        h('h2', {}, 'Make it yours'), h('p', { class: 'muted' }, 'A few choices to start. You can change everything later.'),
        // Three steps on a rail: a numbered circle each, joined by a hairline.
        h('ol', { class: 'welcome-steps' },
          h('li', { class: 'welcome-field' }, h('h3', {}, 'Keep these apps close'), h('p', { class: 'muted' }, 'Choose the apps for your rail. Add any website later.'), apps),
          h('li', { class: 'welcome-row' }, h('div', {}, h('h3', {}, 'Sidebar position'), h('p', { class: 'muted' }, 'Choose the edge that suits you.')), seg(draft.rail.side, [['left', 'Left'], ['right', 'Right']], (side) => { draft.rail.side = side; preview.dataset.side = side; })),
          h('li', { class: 'welcome-row' }, h('div', {}, h('h3', {}, 'Use the sidegig new tab'), h('p', { class: 'muted' }, 'Search, bookmarks, notes and a focus timer.')), toggle(draft.newtab.enabled, (enabled) => { draft.newtab.enabled = enabled; }, 'Use the sidegig new tab')),
        ),
        start, status, h('p', { class: 'welcome-private' }, ico('check', 16), 'Free and open source. No analytics. Your keys stay on this device.'),
      ),
    ),
  );
}
