// Generates a browser-specific manifest.json from one description.
// Targets: chrome (Chrome, Edge, Brave, Arc, Dia, Vivaldi, Aside), opera, firefox, safari.
import { CATALOG } from '../src/shared/catalog.ts';
import pkg from '../package.json' with { type: 'json' };

export const TARGETS = ['chrome', 'opera', 'firefox', 'safari'];

// Hosts where the bridge script runs (unread badges, AI prompt fill).
// User-added apps get the bridge registered at runtime via chrome.scripting.
export function bridgeMatches() {
  const hosts = new Set();
  for (const app of CATALOG) hosts.add(new URL(app.url).hostname);
  return [...hosts].sort().map((h) => `https://${h}/*`);
}

const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };

const commands = {
  'toggle-rail': {
    suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
    description: 'Show or hide the sidegig rail on this page',
  },
  'open-search': {
    suggested_key: { default: 'Alt+Shift+K', mac: 'Alt+Shift+K' },
    description: 'Search tabs, bookmarks, history and apps',
  },
  'ask-ai': {
    suggested_key: { default: 'Alt+Shift+A', mac: 'Alt+Shift+A' },
    description: 'Ask AI about this page or the selected text',
  },
};

export function manifestFor(target) {
  if (!TARGETS.includes(target)) throw new Error(`Unknown target: ${target}`);
  const chromium = target === 'chrome' || target === 'opera';

  const permissions = [
    'storage',
    'bookmarks',
    'tabs',
    'history',
    'contextMenus',
    'alarms',
    'scripting',
    'declarativeNetRequestWithHostAccess',
    // Your own backgrounds and the printed wallpaper live on this device.
    'unlimitedStorage',
    // Clear a site's service worker before showing it in the sidebar (Gmail, X).
    'browsingData',
    // Let a sidebar app's own scripts read its same-site cookies inside sidegig's frames (see background/framecookies.ts).
    'cookies',
    // Sign-in windows for OpenRouter and MCP servers (launchWebAuthFlow). No install warning, no prompt.
    'identity',
  ];
  if (chromium) permissions.push('sidePanel', 'favicon', 'tabGroups', 'search');
  if (target === 'firefox') permissions.push('search');

  const war = [
    {
      resources: ['drawer.html', 'ui.js', 'ui.css', 'icons/*', ...(chromium ? ['_favicon/*'] : [])],
      matches: ['<all_urls>'],
      // Chrome 130+: reachable only at a per-session random URL, so a website can't embed
      // the drawer (and the apps in it) or probe the favicon cache. Firefox's URL is random already.
      ...(chromium ? { use_dynamic_url: true } : {}),
    },
  ];

  const m = {
    manifest_version: 3,
    name: pkg.name,
    short_name: pkg.name,
    version: pkg.version,
    description:
      'A free, open-source sidebar for every browser. Hover the edge of any page for your apps, one-tap AI, bookmark stacks and search.',
    icons,
    action: { default_title: 'sidegig', default_icon: icons },
    permissions,
    // Link rules (webNavigation) and the weekly backup file (downloads), asked for when turned on.
    optional_permissions: ['webNavigation', 'downloads'],
    host_permissions: ['<all_urls>'],
    commands,
    options_ui: { page: 'options.html', open_in_tab: true },
    chrome_url_overrides: { newtab: 'newtab.html' },
    content_scripts: [
      { matches: ['<all_urls>'], js: ['rail.js'], run_at: 'document_start', all_frames: false },
      // Only acts inside sidegig's own app frames (see src/content/framefit.ts).
      { matches: ['https://*/*'], js: ['framefit-main.js'], run_at: 'document_start', all_frames: true, world: 'MAIN' },
      { matches: ['https://*/*'], js: ['framefit.js'], run_at: 'document_start', all_frames: true },
      { matches: bridgeMatches(), js: ['bridge.js'], run_at: 'document_idle', all_frames: true },
    ],
    web_accessible_resources: war,
  };

  if (chromium) {
    m.background = { service_worker: 'background.js' };
    m.side_panel = { default_path: 'panel.html' };
    m.minimum_chrome_version = '130';
  }
  if (target === 'opera') {
    // Opera shows extension panels in its own sidebar (icon, tooltip, badge, panel).
    m.sidebar_action = { default_panel: 'panel.html', default_title: 'sidegig', default_icon: 'icons/32.png' };
  }
  if (target === 'firefox') {
    m.background = { scripts: ['background.js'] };
    m.sidebar_action = {
      default_panel: 'panel.html',
      default_title: 'sidegig',
      default_icon: 'icons/32.png',
      open_at_install: false,
    };
    m.browser_specific_settings = { gecko: { id: 'sidegig@neerajbhargav.com', strict_min_version: '148.0' } };
  }
  if (target === 'safari') {
    m.background = { scripts: ['background.js'], persistent: false };
  }
  return m;
}
