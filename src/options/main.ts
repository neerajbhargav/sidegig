// Full settings page.
import { ext, features, uid, TARGET } from '../shared/api.ts';
import { loadSettings, saveSettings, onSettingsChanged, loadSecrets, saveSecrets, mergeSettings, migrate } from '../shared/storage.ts';
import { defaultSettings, appFromCatalog } from '../shared/defaults.ts';
import { CATALOG } from '../shared/catalog.ts';
import { themeCss } from '../shared/theme.ts';
import type { AppEntry, OpenIn, Settings, StatusCard } from '../shared/types.ts';
import { h, iconButton, favicon, toast, keys } from '../ui/dom.ts';
import { seg, toggle, opt, ACCENTS } from '../ui/views/quick.ts';
import { send } from '../ui/ctx.ts';

let s: Settings;
const themeStyle = h('style');
const page = h('div', { class: 'opts' });
const NAV: [string, string][] = [
  ['rail', 'Rail'],
  ['appearance', 'Appearance'],
  ['apps', 'Apps'],
  ['stacks', 'Stacks and spaces'],
  ['ai', 'Ask AI'],
  ['status', 'Status cards'],
  ['rules', 'Link rules'],
  ['tabs', 'Tab sleep'],
  ['edition', 'New tab edition'],
  ['backup', 'Backup'],
  ['privacy', 'Privacy'],
];

const commit = async (fn: (x: Settings) => void) => {
  fn(s);
  await saveSettings(s);
};

const section = (id: string, title: string, intro: string | null, ...kids: (HTMLElement | null)[]) =>
  h(
    'section',
    { id, style: { marginTop: '36px' } },
    h('h2', { style: { fontSize: '16px', fontWeight: '600', letterSpacing: '-0.01em', margin: '0 0 4px' } }, title),
    intro ? h('p', { class: 'muted', style: { margin: '0 0 12px' } }, intro) : null,
    ...kids,
  );

const textInput = (value: string, onCommit: (v: string) => void, props: Record<string, unknown> = {}) =>
  h('input', { class: 'text-input', value, onchange: (e: Event) => onCommit((e.target as HTMLInputElement).value), ...props });

const OPEN_IN: [OpenIn, string][] = [
  ['panel', 'Sidebar'],
  ['window', 'Mini window'],
  ['tab', 'Tab'],
  ['drawer', 'In-page drawer'],
];

function appRow(app: AppEntry, i: number): HTMLElement {
  const move = (d: number) =>
    commit((x) => {
      const j = i + d;
      if (j < 0 || j >= x.apps.length) return;
      [x.apps[i], x.apps[j]] = [x.apps[j], x.apps[i]];
    });
  const select = h(
    'select',
    { class: 'text-input', onchange: (e: Event) => commit((x) => void (x.apps[i].openIn = (e.target as HTMLSelectElement).value as OpenIn)) },
    OPEN_IN.map(([v, label]) => h('option', { value: v, selected: v === app.openIn }, label)),
  );
  return h(
    'div',
    { class: 'opt', style: { flexWrap: 'wrap', padding: '6px 0' } },
    favicon(app.url, app.name),
    h(
      'div',
      { class: 'text', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      textInput(app.name, (v) => commit((x) => void (x.apps[i].name = v.trim() || x.apps[i].name)), { style: { width: '130px' }, 'aria-label': 'Name' }),
      textInput(app.url, (v) => commit((x) => {
        try {
          x.apps[i].url = new URL(v.trim()).toString();
        } catch {
          toast('That URL doesn’t look right');
        }
      }), { style: { flex: '1', minWidth: '180px' }, 'aria-label': 'URL' }),
    ),
    select,
    h('span', { class: 'subtle' }, 'Mobile'),
    toggle(app.mobile, (v) => commit((x) => void (x.apps[i].mobile = v)), `Mobile layout for ${app.name}`),
    h('span', { class: 'subtle' }, 'Badge'),
    toggle(app.badge, (v) => commit((x) => void (x.apps[i].badge = v)), `Unread badge for ${app.name}`),
    iconButton('up', 'Move up', () => void move(-1)),
    iconButton('down', 'Move down', () => void move(1)),
    iconButton('trash', 'Remove', () => void commit((x) => void x.apps.splice(i, 1))),
  );
}

function appsSection(): HTMLElement {
  const list = h('div', { class: 'group' }, s.apps.map(appRow));
  if (!s.apps.length) list.append(h('div', { class: 'empty' }, 'No apps yet. Add some below.'));
  const have = new Set(s.apps.map((a) => a.catalogId ?? a.id));
  const cats = [...new Set(CATALOG.map((c) => c.category))];
  const catalog = h('div');
  for (const cat of cats) {
    const items = CATALOG.filter((c) => c.category === cat && !have.has(c.id));
    if (!items.length) continue;
    catalog.append(
      h('div', { class: 'label' }, cat),
      h(
        'div',
        { class: 'tiles' },
        items.map((c) =>
          h(
            'button',
            { class: 'tile', type: 'button', title: `Add ${c.name}`, onclick: () => commit((x) => void x.apps.push(appFromCatalog(c.id))) },
            favicon(c.url, c.name),
            h('span', { class: 'name' }, c.name),
          ),
        ),
      ),
    );
  }
  const name = h('input', { class: 'text-input', placeholder: 'Name', style: { width: '140px' } });
  const url = h('input', { class: 'text-input', placeholder: 'https://any-site.com', style: { flex: '1' } });
  const add = h('form', { class: 'opt', style: { gap: '8px' } }, name, url, h('button', { class: 'btn primary', type: 'submit' }, 'Add site'));
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    let u: URL;
    try {
      u = new URL(/^https?:\/\//.test(url.value.trim()) ? url.value.trim() : `https://${url.value.trim()}`);
    } catch {
      return toast('That URL doesn’t look right');
    }
    void commit((x) =>
      void x.apps.push({ id: uid('app_'), name: name.value.trim() || u.hostname.replace(/^www\./, ''), url: u.toString(), openIn: 'panel', mobile: false, badge: true }),
    );
  });
  return section(
    'apps',
    'Apps',
    '“Sidebar” opens in the browser’s own side panel, where your logins work. “Mini window” is a slim window docked to the side. “In-page drawer” is fastest but most sites will look signed out there.',
    list,
    h('div', { class: 'label' }, 'Add any site'),
    h('div', { class: 'group' }, add),
    catalog,
  );
}

async function stacksSection(): Promise<HTMLElement> {
  const [tree] = await ext.bookmarks.getTree();
  const rows: HTMLElement[] = [];
  const walk = (n: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
    for (const c of n.children ?? []) {
      if (c.url) continue;
      const on = s.stacks.spaces.includes(c.id);
      const count = (c.children ?? []).length;
      rows.push(
        h(
          'div',
          { class: 'opt', style: { paddingLeft: `${depth * 18}px`, minHeight: '36px' } },
          h('div', { class: 'text' }, h('span', { class: 't' }, c.title || 'Untitled'), h('span', { class: 'subtle' }, `  ${count} item${count === 1 ? '' : 's'}`)),
          toggle(on, (v) => commit((x) => void (x.stacks.spaces = v ? [...x.stacks.spaces, c.id] : x.stacks.spaces.filter((id) => id !== c.id))), `Use ${c.title} as a space`),
        ),
      );
      if (depth < 2) walk(c, depth + 1);
    }
  };
  walk(tree, 0);
  return section(
    'stacks',
    'Stacks and spaces',
    'Stacks are your normal browser bookmarks, so they sync and stay yours. Turn folders on to use them as spaces; each sub-folder becomes a stack. With none selected, sidegig uses your bookmarks bar.',
    h('div', { class: 'group', style: { maxHeight: '360px', overflowY: 'auto' } }, rows),
  );
}

function aiSection(): HTMLElement {
  const aiApps = [...s.apps.filter((a) => CATALOG.find((c) => c.id === a.catalogId)?.category === 'AI'), ...CATALOG.filter((c) => c.category === 'AI' && !s.apps.some((a) => a.catalogId === c.id)).map((c) => appFromCatalog(c.id))];
  const area = (value: string, onCommit: (v: string) => void) =>
    h('textarea', { class: 'text-input', rows: '4', style: { width: '100%' }, onchange: (e: Event) => onCommit((e.target as HTMLTextAreaElement).value) }, value);
  return section(
    'ai',
    'Ask AI',
    'Uses the AI site you’re already signed in to, so there are no API keys and no extra cost. sidegig types the prompt for you; you press send.',
    h(
      'div',
      { class: 'group' },
      opt(
        'Default AI',
        null,
        h(
          'select',
          { class: 'text-input', onchange: (e: Event) => commit((x) => void (x.ai.defaultApp = (e.target as HTMLSelectElement).value)) },
          aiApps.map((a) => h('option', { value: a.id, selected: a.id === s.ai.defaultApp }, a.name)),
        ),
      ),
      opt('Send automatically', 'Press send for you after typing the prompt', toggle(s.ai.autoSend, (v) => commit((x) => void (x.ai.autoSend = v)), 'Send automatically')),
      opt('Longest page text', 'Characters sent from a page', textInput(String(s.ai.maxChars), (v) => commit((x) => void (x.ai.maxChars = Math.max(500, Number(v) || 12000))), { type: 'number', style: { width: '100px' } })),
    ),
    h('div', { class: 'label' }, 'Prompt for selected text  ·  {text} {title} {url}'),
    area(s.ai.selectionTemplate, (v) => commit((x) => void (x.ai.selectionTemplate = v))),
    h('div', { class: 'label' }, 'Prompt for a whole page'),
    area(s.ai.pageTemplate, (v) => commit((x) => void (x.ai.pageTemplate = v))),
  );
}

async function statusSection(): Promise<HTMLElement> {
  const secrets = await loadSecrets();
  const secretInput = (key: 'githubToken' | 'vercelToken' | 'vercelTeamId', placeholder: string, password = true) =>
    h('input', {
      class: 'text-input',
      type: password ? 'password' : 'text',
      placeholder,
      value: secrets[key] ?? '',
      style: { width: '240px' },
      onchange: async (e: Event) => {
        const next = await loadSecrets();
        next[key] = (e.target as HTMLInputElement).value.trim() || undefined;
        await saveSecrets(next);
        toast('Saved on this device');
      },
    });
  const result = h('div', { class: 'subtle', style: { marginTop: '8px' } });
  return section(
    'status',
    'Status cards',
    'Cards check your own accounts directly from this browser. Tokens are stored only on this device and never synced.',
    h(
      'div',
      { class: 'group' },
      opt('GitHub', 'Notifications and review requests. Token needs “notifications” and “repo” read access.', toggle(s.status.github, (v) => commit((x) => void (x.status.github = v)), 'GitHub card')),
      s.status.github ? opt('GitHub token', null, secretInput('githubToken', 'ghp_…')) : null,
      opt('Vercel', 'Latest deployments and failures', toggle(s.status.vercel, (v) => commit((x) => void (x.status.vercel = v)), 'Vercel card')),
      s.status.vercel ? opt('Vercel token', null, secretInput('vercelToken', 'Vercel access token')) : null,
      s.status.vercel ? opt('Vercel team id', 'Optional', secretInput('vercelTeamId', 'team_…', false)) : null,
      opt('Gmail', 'Unread count, using the Google account signed in to this browser', toggle(s.status.gmail, (v) => commit((x) => void (x.status.gmail = v)), 'Gmail card')),
      opt(
        'Check every',
        null,
        seg(String(s.status.intervalMin) as '2' | '5' | '15' | '30', [['2', '2 min'], ['5', '5 min'], ['15', '15 min'], ['30', '30 min']], (v) => commit((x) => void (x.status.intervalMin = Number(v)))),
      ),
    ),
    h(
      'div',
      { style: { marginTop: '10px' } },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            result.textContent = 'Checking…';
            const cards = ((await send({ type: 'refresh-status' }).catch(() => [])) ?? []) as StatusCard[];
            result.textContent = cards.length ? cards.map((c) => `${c.title}: ${c.error ?? `${c.value} ${c.detail}`}`).join('  ·  ') : 'No cards are turned on.';
          },
        },
        'Check now',
      ),
      result,
    ),
  );
}

function rulesSection(): HTMLElement {
  const list = h('div', { class: 'group' });
  s.rules.forEach((r, i) => {
    list.append(
      h(
        'div',
        { class: 'opt', style: { gap: '8px' } },
        textInput(r.pattern, (v) => commit((x) => void (x.rules[i].pattern = v.trim())), { style: { flex: '1' }, placeholder: 'notion.so' }),
        h(
          'select',
          { class: 'text-input', onchange: (e: Event) => commit((x) => void (x.rules[i].action = (e.target as HTMLSelectElement).value as 'window' | 'reuse-tab')) },
          h('option', { value: 'window', selected: r.action === 'window' }, 'Open in mini window'),
          h('option', { value: 'reuse-tab', selected: r.action === 'reuse-tab' }, 'Reuse an open tab'),
        ),
        toggle(r.enabled, (v) => commit((x) => void (x.rules[i].enabled = v)), 'Rule on'),
        iconButton('trash', 'Delete rule', () => void commit((x) => void x.rules.splice(i, 1))),
      ),
    );
  });
  if (!s.rules.length) list.append(h('div', { class: 'subtle', style: { padding: '12px 0' } }, 'No rules yet.'));
  const add = h('button', {
    class: 'btn',
    type: 'button',
    onclick: () => {
      // Must be requested inside the click.
      const perm = (ext as any).permissions?.request?.({ permissions: ['webNavigation'] });
      void Promise.resolve(perm).then((ok: boolean | undefined) => {
        if (ok === false) return toast('Link rules need permission to see new tabs');
        void commit((x) => void x.rules.push({ id: uid('r_'), pattern: '', action: 'reuse-tab', enabled: true }));
      });
    },
  }, '+ Add rule');
  return section('rules', 'Link rules', 'Decide where links to certain sites open, like Arc’s Air Traffic Control. Applies to links that would open a new tab.', list, h('div', { style: { marginTop: '10px' } }, add));
}

function appearanceSection(): HTMLElement {
  const color = (value: string, onCommit: (v: string) => void) =>
    h('input', { type: 'color', value, style: { width: '36px', height: '28px', border: '0', background: 'transparent', padding: '0' }, onchange: (e: Event) => onCommit((e.target as HTMLInputElement).value) });
  return section(
    'appearance',
    'Appearance',
    'Three inputs make the whole palette: a base tint, an accent and a contrast level. Every combination stays readable.',
    h(
      'div',
      { class: 'group' },
      opt('Theme', 'Page = match each website’s light or dark look', seg(s.theme.mode, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['page', 'Page']], (v) => commit((x) => void (x.theme.mode = v)))),
      opt('Accent', null, h('div', { class: 'swatches', style: { alignItems: 'center' } }, ACCENTS.map((c) => h('button', { class: 'swatch', type: 'button', title: c, style: { background: c }, 'aria-pressed': String(c === s.theme.accent), onclick: () => commit((x) => void (x.theme.accent = c)) })), color(s.theme.accent, (v) => commit((x) => void (x.theme.accent = v))))),
      opt('Base tint', 'A whisper of color in the surfaces', color(s.theme.base, (v) => commit((x) => void (x.theme.base = v)))),
      opt('Contrast', `${s.theme.contrast}`, h('input', { class: 'range', type: 'range', min: '0', max: '100', step: '5', value: String(s.theme.contrast), onchange: (e: Event) => commit((x) => void (x.theme.contrast = Number((e.target as HTMLInputElement).value))) })),
      opt('Corner radius', `${s.theme.radius}px`, h('input', { class: 'range', type: 'range', min: '4', max: '16', step: '1', value: String(s.theme.radius), onchange: (e: Event) => commit((x) => void (x.theme.radius = Number((e.target as HTMLInputElement).value))) })),
    ),
    h('div', { class: 'label' }, 'Custom CSS (applies to the rail and sidegig’s pages)'),
    h('textarea', { class: 'text-input', rows: '4', style: { width: '100%' }, placeholder: '.rail { border-radius: 0 }', onchange: (e: Event) => commit((x) => void (x.theme.customCss = (e.target as HTMLTextAreaElement).value)) }, s.theme.customCss),
  );
}

function railSection(): HTMLElement {
  return section(
    'rail',
    'Rail',
    `Docked keeps the rail beside every page, like Opera's sidebar: pages make room for it, so nothing is covered. On hover, it slides in when the pointer touches the edge. Shortcuts: ${keys('S')} toggles it, ${keys('K')} searches, ${keys('A')} asks AI.`,
    h(
      'div',
      { class: 'group' },
      opt('Show', null, seg(s.rail.mode, [['docked', 'Docked'], ['hover', 'On hover'], ['off', 'Off']], (v) => commit((x) => void (x.rail.mode = v)))),
      opt('Side', null, seg(s.rail.side, [['left', 'Left'], ['right', 'Right']], (v) => commit((x) => void (x.rail.side = v)))),
      opt('Size', null, seg(s.rail.size, [['compact', 'Compact'], ['comfortable', 'Comfortable']], (v) => commit((x) => void (x.rail.size = v)))),
      opt('Edge sensitivity', `${s.rail.hotZone}px from the edge`, h('input', { class: 'range', type: 'range', min: '2', max: '24', value: String(s.rail.hotZone), onchange: (e: Event) => commit((x) => void (x.rail.hotZone = Number((e.target as HTMLInputElement).value))) })),
      opt('Delay', `${s.rail.delay}ms before it appears`, h('input', { class: 'range', type: 'range', min: '0', max: '600', step: '20', value: String(s.rail.delay), onchange: (e: Event) => commit((x) => void (x.rail.delay = Number((e.target as HTMLInputElement).value))) })),
      opt('Hide in fullscreen', 'Videos and presentations', toggle(s.rail.hideInFullscreen, (v) => commit((x) => void (x.rail.hideInFullscreen = v)), 'Hide in fullscreen')),
      opt('Float instead of docking on', 'Comma separated. The rail slides over these sites instead of making room', textInput(s.rail.floatOn.join(', '), (v) => commit((x) => void (x.rail.floatOn = v.split(',').map((e) => e.trim()).filter(Boolean))), { style: { width: '260px' }, placeholder: 'docs.google.com' })),
      opt('Hidden on these sites', 'Comma separated', textInput(s.rail.excluded.join(', '), (v) => commit((x) => void (x.rail.excluded = v.split(',').map((e) => e.trim()).filter(Boolean))), { style: { width: '260px' }, placeholder: 'docs.google.com, figma.com' })),
      features.sidePanel || TARGET === 'firefox'
        ? opt('Keyboard shortcuts', 'Change them in the browser’s extension shortcuts page', h('button', { class: 'btn', type: 'button', onclick: () => void ext.tabs.create({ url: TARGET === 'firefox' ? 'about:addons' : 'chrome://extensions/shortcuts' }) }, 'Open'))
        : null,
    ),
  );
}

function tabsSection(): HTMLElement {
  return section(
    'tabs',
    'Tab sleep',
    'Unload tabs you haven’t touched in a while. Pinned tabs and tabs playing audio are never touched.',
    h(
      'div',
      { class: 'group' },
      opt('Sleep idle tabs automatically', null, toggle(s.sleep.enabled, (v) => commit((x) => void (x.sleep.enabled = v)), 'Sleep idle tabs')),
      opt('After', null, seg(String(s.sleep.afterMin) as '30' | '60' | '120' | '240', [['30', '30 min'], ['60', '1 hr'], ['120', '2 hr'], ['240', '4 hr']], (v) => commit((x) => void (x.sleep.afterMin = Number(v))))),
    ),
  );
}

function editionSection(): HTMLElement {
  const e = s.edition;
  const clear = h('button', { class: 'btn', type: 'button' }, 'Clear interests, saves and history');
  clear.addEventListener('click', async () => {
    if (!confirm('Clear your interests, reading list and edition history on this device?')) return;
    await ext.storage.local.remove(['edProfile', 'edSaved', 'edSeen', 'edDismissed', 'edition', 'edStatus', 'edImport']);
    toast('Cleared');
  });
  return section(
    'edition',
    'New tab edition',
    'A short issue of articles, videos, podcasts, books and discussions on every new tab, picked from your interests (your AI can fill them in). It ends instead of scrolling forever. Edit interests and formats on the new tab itself.',
    h(
      'div',
      { class: 'group' },
      opt('Show the edition on new tabs', null, toggle(e.enabled, (v) => commit((x) => void (x.edition.enabled = v)), 'Show the edition')),
      opt('Items per edition', null, seg(String(e.size) as '6' | '9' | '12' | '18', [['6', '6'], ['9', '9'], ['12', '12'], ['18', '18']], (v) => commit((x) => void (x.edition.size = Number(v))))),
      opt('New edition every', null, seg(String(e.refreshHours) as '6' | '12' | '24', [['6', '6 hr'], ['12', '12 hr'], ['24', 'Day']], (v) => commit((x) => void (x.edition.refreshHours = Number(v))))),
      opt('Let on-device AI review and explain picks', 'Uses the model built into your browser (Gemini Nano in Chrome) when it’s there. Nothing leaves your computer.', toggle(e.onDeviceAi, (v) => commit((x) => void (x.edition.onDeviceAi = v)), 'On-device AI')),
    ),
    h(
      'p',
      { class: 'muted', style: { lineHeight: '1.7', marginTop: '12px' } },
      'Your interests, reading list and edition history stay on this device. To build an edition, sidegig sends short search phrases (your interests) to the sources you turn on: Hacker News, Substack, Google News, YouTube, Apple, Open Library, arXiv and Reddit. Requests are signed out, so they don’t touch your accounts or their recommendations.',
    ),
    h('div', { class: 'actions' }, clear),
  );
}

function backupSection(): HTMLElement {
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const next = mergeSettings(defaultSettings(), migrate(JSON.parse(await f.text())));
      await saveSettings(next);
      toast('Settings imported');
    } catch {
      toast('That file isn’t a sidegig backup');
    }
  });
  return section(
    'backup',
    'Backup',
    'Export your settings to a file (tokens are never included) or bring them to another browser.',
    h(
      'div',
      { style: { display: 'flex', gap: '8px' } },
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: () => {
          const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'sidegig-settings.json' });
          a.click();
        },
      }, 'Export'),
      h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => confirm('Reset all sidegig settings?') && void saveSettings(defaultSettings()) }, 'Reset'),
      file,
    ),
  );
}

async function render() {
  const t = s.theme;
  themeStyle.textContent = themeCss(':root', t.mode === 'page' ? 'system' : t.mode, t, t.radius) + 'body{overflow:auto}' + (t.customCss || '');
  const y = window.scrollY;
  const welcome = location.hash === '#welcome';
  const parts: (HTMLElement | null)[] = [
    h('h1', { style: { fontSize: '24px', margin: '0', letterSpacing: '-0.02em' } }, 'Settings'),
    h('div', { class: 'muted', style: { marginTop: '4px' } }, 'Everything here is optional. sidegig works out of the box.'),
    welcome
      ? h(
          'div',
          { class: 'card', style: { marginTop: '24px' } },
          h('div', { class: 'card-title' }, 'You’re set up'),
          h('div', { class: 'card-detail', style: { marginTop: '6px', lineHeight: '1.6' } }, `Move your pointer to the left edge of any web page and the rail slides in. Click an app to open it in the sidebar, or press ${keys('K')} to search everything.`),
        )
      : null,
    railSection(),
    appearanceSection(),
    appsSection(),
    await stacksSection(),
    aiSection(),
    await statusSection(),
    rulesSection(),
    tabsSection(),
    editionSection(),
    backupSection(),
    section(
      'privacy',
      'Privacy',
      null,
      h(
        'p',
        { class: 'muted', style: { lineHeight: '1.7' } },
        'sidegig has no servers, no accounts and no analytics. Settings sync through your browser’s own sync. Tokens stay on this device. sidegig only changes network headers for frames inside its own panel, so sites can load there. Source code: GPL-3.0.',
      ),
    ),
  ];
  const main = h('main', {}, ...parts.filter((p): p is HTMLElement => !!p));
  const nav = h(
    'nav',
    { 'aria-label': 'Settings sections' },
    h('div', { class: 'brand' }, h('img', { src: 'icons/32.png', width: '24', height: '24', alt: '' }), h('b', {}, 'sidegig')),
    NAV.map(([id, label]) => h('a', { href: `#${id}`, 'data-id': id }, label)),
  );
  page.replaceChildren(nav, main);
  highlightNav();
  window.scrollTo(0, y);
}

function highlightNav() {
  const secs = NAV.map(([id]) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
  let current = secs[0]?.id;
  for (const sec of secs) if (sec.getBoundingClientRect().top < 140) current = sec.id;
  document.querySelectorAll<HTMLElement>('.opts nav a').forEach((a) => a.classList.toggle('on', a.dataset.id === current));
}
window.addEventListener('scroll', () => requestAnimationFrame(highlightNav), { passive: true });

async function boot() {
  document.head.append(themeStyle);
  document.body.classList.add('ctx-options');
  document.body.append(page);
  s = await loadSettings();
  await render();
  if (location.hash && location.hash !== '#welcome') document.querySelector(location.hash)?.scrollIntoView();
  onSettingsChanged((next) => {
    s = next;
    void render();
  });
}

void boot();
