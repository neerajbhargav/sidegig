// Quick settings inside the drawer/panel. The full page is options.html.
import { updateSettings } from '../../shared/storage.ts';
import { hostExcluded } from '../../shared/rules.ts';
import type { Settings } from '../../shared/types.ts';
import { h, iconButton } from '../dom.ts';
import { type Ctx, activeTab, openOptions } from '../ctx.ts';

export const ACCENTS = ['#0b57d0', '#3b6ef5', '#7c5cff', '#e5484d', '#f2994a', '#2fb36d', '#14b8a6', '#1f2328'];

export function seg<T extends string>(value: T, options: [T, string][], onPick: (v: T) => void): HTMLElement {
  const el = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) {
    el.append(h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, label));
  }
  return el;
}

export function toggle(on: boolean, onChange: (v: boolean) => void, label: string): HTMLElement {
  return h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => onChange(!on) });
}

export const opt = (title: string, meta: string | null, control: HTMLElement) =>
  h('div', { class: 'opt' }, h('div', { class: 'text' }, h('div', { class: 't' }, title), meta ? h('div', { class: 'm' }, meta) : null), control);

const set = (fn: (s: Settings) => void) => void updateSettings(fn);

export async function quickView(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.settings;
  const tab = await activeTab(ctx);
  let host = '';
  try {
    host = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : '';
  } catch {
    host = '';
  }
  const root = h('div', { class: 'app' });
  const pad = h('div', { class: 'pad' });
  pad.append(
    h('div', { class: 'label' }, 'Rail'),
    h(
      'div',
      { class: 'group' },
      opt('Show', null, seg(s.rail.mode, [['docked', 'Docked'], ['hover', 'Hover'], ['off', 'Off']], (v) => set((x) => void (x.rail.mode = v)))),
      opt('Side', null, seg(s.rail.side, [['left', 'Left'], ['right', 'Right']], (v) => set((x) => void (x.rail.side = v)))),
      opt('Size', null, seg(s.rail.size, [['compact', 'Compact'], ['comfortable', 'Comfy']], (v) => set((x) => void (x.rail.size = v)))),
      host && s.rail.mode === 'docked'
        ? opt(
            `Float on ${host}`,
            'Slide over this site instead of making room',
            toggle(hostExcluded(s.rail.floatOn, host), (v) =>
              set((x) => void (x.rail.floatOn = v ? [...new Set([...x.rail.floatOn, host])] : x.rail.floatOn.filter((e) => e !== host))),
            `Float on ${host}`),
          )
        : null,
      host
        ? opt(
            `Hide on ${host}`,
            'The shortcut still works here',
            toggle(hostExcluded(s.rail.excluded, host), (v) =>
              set((x) => void (x.rail.excluded = v ? [...new Set([...x.rail.excluded, host])] : x.rail.excluded.filter((e) => e !== host))),
            `Hide on ${host}`),
          )
        : null,
    ),
    h('div', { class: 'label' }, 'Appearance'),
    h(
      'div',
      { class: 'group' },
      opt('Theme', s.theme.mode === 'page' ? 'Follows each page’s colors' : null, seg(s.theme.mode, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['page', 'Page']], (v) => set((x) => void (x.theme.mode = v)))),
      opt(
        'Accent',
        null,
        h(
          'div',
          { class: 'swatches' },
          ACCENTS.map((c) =>
            h('button', { class: 'swatch', type: 'button', title: c, style: { background: c }, 'aria-pressed': String(c.toLowerCase() === s.theme.accent.toLowerCase()), onclick: () => set((x) => void (x.theme.accent = c)) }),
          ),
        ),
      ),
      opt(
        'Contrast',
        null,
        h('input', {
          class: 'range',
          type: 'range',
          min: '0',
          max: '100',
          step: '5',
          value: String(s.theme.contrast),
          onchange: (e: Event) => set((x) => void (x.theme.contrast = Number((e.target as HTMLInputElement).value))),
        }),
      ),
    ),
    h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn', type: 'button', onclick: () => openOptions() }, 'All settings')),
  );
  root.append(
    h(
      'div',
      { class: 'bar' },
      iconButton('back', 'Back', () => ctx.go('home')),
      h('span', { class: 'title' }, 'Settings'),
      ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
    ),
    h('div', { class: 'scroll' }, pad),
  );
  return root;
}
