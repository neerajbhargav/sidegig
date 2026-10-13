// Full settings page.
import { ext, features, uid, TARGET } from '../shared/api.ts';
import { loadSettings, saveSettings, onSettingsChanged, loadSecrets, saveSecrets } from '../shared/storage.ts';
import { defaultSettings, appFromCatalog } from '../shared/defaults.ts';
import { CATALOG } from '../shared/catalog.ts';
import { themeCss } from '../shared/theme.ts';
import type { AppEntry, OpenIn, Settings, StatusCard } from '../shared/types.ts';
import { h, iconButton, favicon, toast, keys } from '../ui/dom.ts';
import { seg, toggle, opt, ACCENTS } from '../ui/views/quick.ts';
import { send } from '../ui/ctx.ts';
import { ENGINES } from '../shared/ntdata.ts';
import { findPlace } from '../ui/views/ntwidgets.ts';
import { addUpload, prepareImage } from '../ui/views/ntwall.ts';
import { THEMES } from '../ui/views/ntcustom.ts';
import { PACKS } from '../shared/walls.ts';
import { PARTS, allLocalKeys, applySetup, describe, fileName, makeSetup, parseSetup, setupFile, toCode, type SavedSetup, type SetupBundle, type SetupPart } from '../shared/setups.ts';

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
  ['newtab', 'New tab'],
  ['edition', 'New tab edition'],
  ['backup', 'Setups'],
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

function textField(value: string, placeholder: string, onSave: (v: string) => void): HTMLElement {
  const i = h('input', { class: 'text-input', value, placeholder, style: { width: '220px' } });
  i.addEventListener('change', () => onSave(i.value.trim()));
  return i;
}

function backgroundControl(): HTMLElement {
  const b = s.newtab.background;
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  file.addEventListener('change', async () => {
    let last = '';
    for (const f of [...(file.files ?? [])]) {
      try {
        last = (await addUpload(await prepareImage(f))).id;
      } catch {
        toast('Couldn’t use that picture');
      }
    }
    if (last) {
      await commit((x) => void (x.newtab.background = { ...x.newtab.background, kind: 'upload', ref: last }));
      toast('Background set');
    }
  });
  const kinds: [string, string][] = [
    ['none', 'None'],
    ['daily', 'Daily landscape'],
    ['monuments', 'Monuments'],
    ['upload', 'Your pictures'],
    ['gradient', 'Gradient'],
    ['pattern', 'Pattern'],
    ...PACKS.map((c): [string, string] => [`collection:${c.id}`, `Collection: ${c.name}`]),
    ...s.newtab.collections.map((c): [string, string] => [`collection:${c.id}`, `Collection: ${c.name}`]),
  ];
  const current = b.kind === 'collection' ? `collection:${b.ref}` : b.kind;
  return h(
    'div',
    { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
    h(
      'select',
      {
        class: 'text-input',
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const kind = (v.startsWith('collection:') ? 'collection' : v) as typeof b.kind;
          const ref = kind === 'collection' ? v.slice('collection:'.length) : kind === 'gradient' ? 'dawn' : kind === 'pattern' ? 'grille' : '';
          void commit((x) => void (x.newtab.background = { ...x.newtab.background, kind, ref }));
        },
      },
      kinds.map(([v, label]) => h('option', { value: v, selected: v === current }, label)),
      ['photo', 'url', 'color'].includes(b.kind) ? h('option', { value: b.kind, selected: true }, 'Picked on the new tab') : null,
    ),
    h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, 'Upload…'),
    h(
      'select',
      { class: 'text-input', 'aria-label': 'Effect', onchange: (e: Event) => void commit((x) => void (x.newtab.background.treatment = (e.target as HTMLSelectElement).value as typeof b.treatment)) },
      (
        [
          ['auto', 'Effect: Auto'],
          ['photo', 'Photo'],
          ['film', 'Film'],
          ['dream', 'Dream'],
          ['led', 'LED'],
          ['mosaic', 'Mosaic'],
          ['print', 'Print'],
        ] as const
      ).map(([v, label]) => h('option', { value: v, selected: v === b.treatment }, label)),
    ),
    file,
  );
}

function weatherControl(): HTMLElement {
  const w = s.newtab.weather;
  const q = h('input', { class: 'text-input', placeholder: 'City', value: w.place, style: { width: '200px' } });
  const results = h('div', { class: 'chips', style: { flexWrap: 'wrap', marginTop: '6px' } });
  const find = async () => {
    if (!q.value.trim()) return;
    results.textContent = 'Looking…';
    const places = await findPlace(q.value.trim()).catch(() => []);
    results.replaceChildren(
      ...(places.length
        ? places.map((p) =>
            h('button', { type: 'button', class: 'chip', onclick: () => commit((x) => void (x.newtab.weather = { ...x.newtab.weather, enabled: true, place: p.name, lat: p.lat, lon: p.lon })) }, p.name),
          )
        : [h('span', { class: 'muted' }, 'No places found')]),
    );
  };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && void find());
  return h(
    'div',
    {},
    h(
      'div',
      { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      toggle(w.enabled && !!w.place, (v) => commit((x) => void (x.newtab.weather.enabled = v)), 'Weather'),
      q,
      h('button', { type: 'button', class: 'btn', onclick: () => void find() }, 'Find'),
      seg(w.units, [['f', '°F'], ['c', '°C']], (v) => commit((x) => void (x.newtab.weather.units = v))),
    ),
    results,
  );
}

function newtabSection(): HTMLElement {
  const n = s.newtab;
  const setOff = async (on: boolean) => {
    const b = (await ext.storage.local.get('browserInfo')).browserInfo as { ntp?: string; browser?: string } | undefined;
    try {
      if (on) localStorage.removeItem('sidegig.ntOff');
      else {
        localStorage.setItem('sidegig.ntOff', '1');
        localStorage.setItem('sidegig.ntFallback', b?.ntp ?? 'chrome://new-tab-page/');
      }
    } catch {
      /* fine */
    }
    await ext.storage.local.set({ ntChoiceMade: true });
  };
  return section(
    'newtab',
    'New tab',
    'Optional. With it off, new tabs go straight to your browser’s own new tab page (or a blank page where the browser has none to return to). Browsers only let an extension replace the new tab at install, so “off” hands each new tab back instantly instead.',
    h(
      'div',
      { class: 'group' },
      opt('Use sidegig as the new tab page', null, toggle(n.enabled, (v) => void setOff(v).then(() => commit((x) => void (x.newtab.enabled = v))), 'Use sidegig as the new tab page')),
      opt(
        'Theme',
        '“Match browser” follows your browser’s own style (Chrome, Edge, Arc, Dia, Aside, Opera, Brave…). The rest are sidegig’s studio themes. Every choice, with previews, is in Customize on the new tab.',
        h(
          'select',
          {
            class: 'text-input',
            onchange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value as typeof n.look;
              try {
                localStorage.setItem('sidegig.ntLook', v);
              } catch {
                /* fine */
              }
              void commit((x) => void (x.newtab.look = v));
            },
          },
          THEMES.map((t) => h('option', { value: t.id, selected: t.id === n.look }, t.name)),
        ),
      ),
      opt('Home | AI switch', 'Your browser’s own AI and your chats with every assistant, one tab away (press Tab in the empty search box).', toggle(n.aiTab, (v) => commit((x) => void (x.newtab.aiTab = v)), 'Home and AI switch')),
      opt('Clock', null, toggle(n.clock, (v) => commit((x) => void (x.newtab.clock = v)), 'Clock')),
      opt('Clock style', null, seg(n.clockStyle, [['digital', 'Digital'], ['analog', 'Analog']], (v) => commit((x) => void (x.newtab.clockStyle = v)))),
      opt(
        'Name on the page',
        'What the new tab calls itself in the corner, instead of “sidegig”. You can also click the name on the new tab to change it.',
        h(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          textField(n.title, 'sidegig', (v) => commit((x) => void (x.newtab.title = v.trim().slice(0, 32)))),
          textField(n.tag, 'Tag (optional)', (v) => commit((x) => void (x.newtab.tag = v.trim().slice(0, 16)))),
        ),
      ),
      opt('Your name', 'For the greeting: “Good morning, …”', textField(n.name, 'Name', (v) => commit((x) => void (x.newtab.name = v)))),
      opt('Custom message', 'Shown instead of the greeting.', textField(n.message, 'Optional', (v) => commit((x) => void (x.newtab.message = v)))),
      opt(
        'Search engine',
        '“Browser default” uses whatever your browser is set to.',
        h(
          'select',
          { class: 'text-input', onchange: (e: Event) => commit((x) => void (x.newtab.engine = (e.target as HTMLSelectElement).value)) },
          Object.entries(ENGINES).map(([id, en]) => h('option', { value: id, selected: id === n.engine }, en.name)),
        ),
      ),
      opt(
        'Accent',
        'Colours the new tab’s highlights. Empty uses the look’s own.',
        h(
          'div',
          { class: 'swatches' },
          h('button', { type: 'button', class: 'swatch', title: 'The look’s own', 'aria-pressed': String(!n.accent), style: { background: 'conic-gradient(#ff4f00, #2c5bff, #12a150, #ff4f00)' }, onclick: () => commit((x) => void (x.newtab.accent = '')) }),
          ['#ff4f00', '#0b57d0', '#6e56ff', '#e0407f', '#12a150', '#e7a800', '#121212'].map((c) =>
            h('button', { type: 'button', class: 'swatch', title: c, 'aria-pressed': String(n.accent === c), style: { background: c }, onclick: () => commit((x) => void (x.newtab.accent = c)) }),
          ),
        ),
      ),
      opt('Background', 'Pick a collection (Cars, Anime, Tech, Space and more, or your own words in Customize) and sidegig collects the wallpapers people loved most, keeps the ones that look great behind a new tab, and refreshes them on its own. Effects: Film, Dream, LED, Mosaic or a risograph Print. Your pictures stay on this device.', backgroundControl()),
      opt('Interface sounds', 'Quiet, synthesized, never the only signal. Positive actions rise, negative ones fall. There’s also a mute button on the new tab.', toggle(n.sounds, (v) => commit((x) => void (x.newtab.sounds = v)), 'Interface sounds')),
      opt('Weather', 'From Open-Meteo: free, no account. Only the place you pick is sent.', weatherControl()),
      opt('To-do list', 'Finished tasks clear each morning; pinned tasks come back every day.', toggle(n.todo, (v) => commit((x) => void (x.newtab.todo = v)), 'To-do list')),
      opt('Calm pictures', 'Thumbnails stay grey until you point at them, so they don’t compete for attention.', toggle(n.calmImages, (v) => commit((x) => void (x.newtab.calmImages = v)), 'Calm pictures')),
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

const SETUPS_KEY = 'setups';
const browserLabel = () => {
  const ua = (navigator as any).userAgentData?.brands?.map((b: { brand: string }) => b.brand).join(' ') ?? navigator.userAgent;
  return /Edg/.test(ua) ? 'Edge' : /Opera|OPR/.test(ua) ? 'Opera' : /Brave/.test(ua) ? 'Brave' : /Vivaldi/.test(ua) ? 'Vivaldi' : /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' : 'Chrome';
};
async function readLocalParts(): Promise<Record<string, unknown>> {
  return (await ext.storage.local.get(allLocalKeys())) as Record<string, unknown>;
}
/** The browser's own name as sidegig detected it (Aside, Arc, Dia...), else a best guess. */
async function detectedBrowser(): Promise<string> {
  const r = await ext.storage.local.get('browserInfo');
  const b = r.browserInfo as { browser?: string } | undefined;
  return b?.browser || browserLabel();
}
async function currentSetup(name: string, parts: SetupPart[]): Promise<SetupBundle> {
  const from = await detectedBrowser();
  return makeSetup(name || `${from} setup`, s, await readLocalParts(), parts, from);
}
function download(bundle: SetupBundle) {
  const a = h('a', { href: URL.createObjectURL(setupFile(bundle)), download: fileName(bundle) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copyCode(bundle: SetupBundle) {
  try {
    await navigator.clipboard.writeText(await toCode(bundle));
    toast('Setup code copied. Paste it into sidegig in your other browser.');
  } catch {
    toast('Couldn’t copy. Use Export file instead.');
  }
}

/** Pick parts and apply a setup (from a file, a code or your saved list). */
function applyDialog(bundle: SetupBundle, onDone: () => void): HTMLElement {
  const picks = new Set<SetupPart>(bundle.parts);
  const box = h('div', { class: 'setup-apply card' });
  const go = async () => {
    const chosen = [...picks];
    if (!chosen.length) return toast('Pick at least one part to apply');
    const { settings, local } = applySetup(s, bundle, chosen);
    await saveSettings(settings);
    if (Object.keys(local).length) await ext.storage.local.set(local);
    toast(`Applied “${bundle.name}”`);
    onDone();
  };
  const saveIt = async () => {
    const list = await getSaved();
    list.unshift({ id: uid('st_'), name: bundle.name, saved: Date.now(), bundle });
    await ext.storage.local.set({ [SETUPS_KEY]: list.slice(0, 20) });
    toast(`Saved “${bundle.name}” to your setups`);
    onDone();
  };
  box.append(
    h('div', { class: 'card-title' }, bundle.name),
    h('div', { class: 'card-detail' }, [describe(bundle) || 'Settings', bundle.from ? `made in ${bundle.from}` : '', new Date(bundle.created).toLocaleDateString()].filter(Boolean).join(' · ')),
    h(
      'div',
      { class: 'setup-parts', role: 'group', 'aria-label': 'Parts to apply' },
      PARTS.filter((p) => bundle.parts.includes(p.id)).map((p) => {
        const cb = h('input', { type: 'checkbox', checked: true });
        cb.addEventListener('change', () => (cb.checked ? picks.add(p.id) : picks.delete(p.id)));
        return h('label', { class: 'setup-part' }, cb, h('span', {}, h('b', {}, p.name), h('small', {}, p.note)));
      }),
    ),
    h(
      'div',
      { class: 'setup-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Apply to this browser'),
      h('button', { class: 'btn', type: 'button', onclick: saveIt }, 'Save to my setups'),
      h('button', { class: 'btn ghost', type: 'button', onclick: onDone }, 'Cancel'),
    ),
  );
  return box;
}

async function getSaved(): Promise<SavedSetup[]> {
  const r = await ext.storage.local.get(SETUPS_KEY);
  return Array.isArray(r[SETUPS_KEY]) ? (r[SETUPS_KEY] as SavedSetup[]) : [];
}

async function setupsSection(): Promise<HTMLElement> {
  const saved = await getSaved();
  const stage = h('div', { class: 'setup-stage' });
  const showApply = (b: SetupBundle) => {
    stage.replaceChildren(applyDialog(b, () => stage.replaceChildren()));
    stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const rerender = () => void render();

  // Save what you have now.
  const nameIn = h('input', { class: 'text-input', type: 'text', placeholder: 'Name, like Work or Home', maxlength: 60, 'aria-label': 'Setup name' });
  const withPics = h('input', { type: 'checkbox' });
  const saveNow = async () => {
    const parts: SetupPart[] = ['apps', 'looks', 'reading', 'todos', ...(withPics.checked ? (['pictures'] as SetupPart[]) : [])];
    const b = await currentSetup(nameIn.value || `${browserLabel()} setup`, parts);
    const list = await getSaved();
    list.unshift({ id: uid('st_'), name: b.name, saved: Date.now(), bundle: b });
    await ext.storage.local.set({ [SETUPS_KEY]: list.slice(0, 20) });
    toast(`Saved “${b.name}”`);
    rerender();
  };

  // Bring one in.
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      showApply(await parseSetup(await f.text(), f.name.replace(/\.json$/i, '')));
    } catch (e) {
      toast((e as Error).message || 'That file isn’t a sidegig setup');
    }
  });
  const codeIn = h('textarea', { class: 'text-input setup-code', rows: 3, placeholder: 'Paste a setup code (starts with sidegig1:)', 'aria-label': 'Setup code' });
  const pasteForm = h(
    'div',
    { class: 'setup-paste', hidden: true },
    codeIn,
    h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        onclick: async () => {
          try {
            showApply(await parseSetup(codeIn.value));
            codeIn.value = '';
            pasteForm.hidden = true;
          } catch (e) {
            toast((e as Error).message);
          }
        },
      },
      'Continue',
    ),
  );

  const list = saved.length
    ? h(
        'div',
        { class: 'setup-list' },
        saved.map((x) =>
          h(
            'div',
            { class: 'setup-row' },
            h('div', { class: 'setup-row-text' }, h('b', {}, x.name), h('small', {}, [describe(x.bundle), x.bundle.from ? `from ${x.bundle.from}` : '', new Date(x.saved).toLocaleDateString()].filter(Boolean).join(' · '))),
            h('button', { class: 'btn primary', type: 'button', onclick: () => showApply(x.bundle) }, 'Apply'),
            h('button', { class: 'btn', type: 'button', onclick: () => download(x.bundle) }, 'Export'),
            h('button', { class: 'btn', type: 'button', onclick: () => void copyCode(x.bundle) }, 'Copy code'),
            iconButton('trash', `Delete ${x.name}`, async () => {
              if (!confirm(`Delete the setup “${x.name}”?`)) return;
              await ext.storage.local.set({ [SETUPS_KEY]: (await getSaved()).filter((y) => y.id !== x.id) });
              rerender();
            }),
          ),
        ),
      )
    : h('p', { class: 'muted' }, 'No saved setups yet.');

  return section(
    'backup',
    'Setups',
    'Save your sidegig as a setup, then carry it to Chrome, Edge, Arc, Brave, Opera, Dia or any browser with sidegig: export a file, or copy a short code and paste it there. When you apply one you pick the parts. Tokens and passwords are never included.',
    h(
      'div',
      { class: 'setup-block' },
      h('div', { class: 'setup-h' }, 'Save this browser’s setup'),
      h('div', { class: 'setup-save' }, nameIn, h('button', { class: 'btn primary', type: 'button', onclick: saveNow }, 'Save')),
      h('label', { class: 'setup-check' }, withPics, h('span', {}, 'Include your uploaded pictures (makes files larger; codes never include them)')),
      h(
        'div',
        { class: 'setup-actions' },
        h('button', { class: 'btn', type: 'button', onclick: async () => download(await currentSetup(nameIn.value || `${browserLabel()} setup`, ['apps', 'looks', 'reading', 'todos', ...(withPics.checked ? (['pictures'] as SetupPart[]) : [])])) }, 'Export file'),
        h('button', { class: 'btn', type: 'button', onclick: async () => void copyCode(await currentSetup(nameIn.value || `${browserLabel()} setup`, ['apps', 'looks', 'reading', 'todos'])) }, 'Copy setup code'),
      ),
    ),
    h(
      'div',
      { class: 'setup-block' },
      h('div', { class: 'setup-h' }, 'Bring a setup here'),
      h(
        'div',
        { class: 'setup-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import file…'),
        h('button', { class: 'btn', type: 'button', onclick: () => ((pasteForm.hidden = !pasteForm.hidden), pasteForm.hidden || codeIn.focus()) }, 'Paste a code'),
        file,
      ),
      pasteForm,
      stage,
    ),
    h('div', { class: 'setup-block' }, h('div', { class: 'setup-h' }, 'Your setups'), list),
    h(
      'div',
      { class: 'setup-block' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => confirm('Reset all sidegig settings? Your saved setups stay.') && void saveSettings(defaultSettings()) }, 'Reset settings'),
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
    newtabSection(),
    editionSection(),
    await setupsSection(),
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
