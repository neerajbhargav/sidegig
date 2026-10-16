// Setups: your sidegig, saved under a name and carried to any browser.
// A setup is one file (or a short code to paste) holding your settings plus
// the bits you made yourself (interests, reading list, to-dos, pictures).
// Applying lets you pick parts. Tokens and passwords are never included.
import { defaultSettings } from './defaults.ts';
import { mergeSettings, migrate } from './storage.ts';
import type { Settings } from './types.ts';

export type SetupPart = 'apps' | 'looks' | 'reading' | 'todos' | 'pictures';

export const PARTS: { id: SetupPart; name: string; note: string }[] = [
  { id: 'apps', name: 'Apps and sidebar', note: 'Apps, rail, stacks, Ask AI, link rules, tab sleep' },
  { id: 'looks', name: 'Looks and new tab', note: 'Appearance, new tab theme, background, collections, name' },
  { id: 'reading', name: 'Interests and reading list', note: 'Edition settings, interests, saved items' },
  { id: 'todos', name: 'To-dos', note: 'Your to-do list' },
  { id: 'pictures', name: 'Your pictures', note: 'Backgrounds you uploaded (larger file)' },
];

/** Which settings each part owns. */
const SETTING_KEYS: Record<Exclude<SetupPart, 'todos' | 'pictures'>, (keyof Settings)[]> = {
  apps: ['apps', 'rail', 'drawer', 'ai', 'stacks', 'rules', 'sleep', 'status'],
  looks: ['theme', 'newtab'],
  reading: ['edition'],
};
/** Which local data each part owns. */
const LOCAL_KEYS: Record<SetupPart, string[]> = {
  apps: ['workspaces'],
  looks: ['ntWallHidden'],
  reading: ['edProfile', 'edSaved'],
  todos: ['ntTodos'],
  pictures: ['ntUploads', 'ntAlbums', 'ntImg:*'],
};

export interface SetupBundle {
  kind: 'sidegig-setup';
  format: 1;
  name: string;
  created: number;
  /** Browser it was made in, for the label ("from Chrome"). */
  from?: string;
  parts: SetupPart[];
  settings: Settings;
  local: Record<string, unknown>;
}

export interface SavedSetup {
  id: string;
  name: string;
  saved: number;
  bundle: SetupBundle;
}

const CODE_PREFIX = 'sidegig1:';
export const MAX_SETUP_BYTES = 12 * 1024 * 1024;

/** Build a setup from the current settings and local data. */
export function makeSetup(name: string, settings: Settings, local: Record<string, unknown>, parts: SetupPart[], from?: string): SetupBundle {
  const keep: Record<string, unknown> = {};
  for (const p of parts) for (const k of LOCAL_KEYS[p]) for (const key of matchKeys(k, local)) keep[key] = local[key];
  return { kind: 'sidegig-setup', format: 1, name: name.trim().slice(0, 60) || 'My setup', created: Date.now(), from, parts: [...new Set(parts)], settings: JSON.parse(JSON.stringify(settings)), local: keep };
}

/** Local keys a setup can carry, for reading them before saving ("ntImg:*" = every key with that prefix). */
export const allLocalKeys = () => [...new Set(Object.values(LOCAL_KEYS).flat())];
export const isPrefixKey = (k: string) => k.endsWith('*');
const matchKeys = (pattern: string, data: Record<string, unknown>) =>
  isPrefixKey(pattern) ? Object.keys(data).filter((k) => k.startsWith(pattern.slice(0, -1))) : data[pattern] !== undefined ? [pattern] : [];

/**
 * The result of applying the chosen parts of a setup on top of what you have:
 * new settings, plus local data to write.
 */
export function applySetup(current: Settings, bundle: SetupBundle, parts: SetupPart[]): { settings: Settings; local: Record<string, unknown> } {
  const incoming = mergeSettings(defaultSettings(), migrate(bundle.settings));
  const next: Settings = JSON.parse(JSON.stringify(current));
  const local: Record<string, unknown> = {};
  for (const p of parts) {
    if (!bundle.parts.includes(p)) continue;
    if (p in SETTING_KEYS) for (const k of SETTING_KEYS[p as keyof typeof SETTING_KEYS]) (next as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(incoming[k]));
    for (const k of LOCAL_KEYS[p]) for (const key of matchKeys(k, bundle.local)) local[key] = bundle.local[key];
  }
  return { settings: next, local };
}

// ------------------------------------------------------------ files and codes

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Turn a parsed object into a setup: new setup files, or a settings export from an older sidegig. */
export function toBundle(data: unknown, fallbackName = 'Imported setup'): SetupBundle {
  if (!isObj(data)) throw new Error('Not a sidegig setup');
  if (data.kind === 'sidegig-setup') {
    if (data.format !== 1) throw new Error('This setup comes from a newer sidegig. Update sidegig, then try again.');
    if (!isObj(data.settings)) throw new Error('This setup has no settings in it');
    const parts = (Array.isArray(data.parts) ? data.parts : []).filter((p): p is SetupPart => PARTS.some((x) => x.id === p));
    return {
      kind: 'sidegig-setup',
      format: 1,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 60) : fallbackName,
      created: typeof data.created === 'number' ? data.created : Date.now(),
      from: typeof data.from === 'string' ? data.from.slice(0, 40) : undefined,
      parts: Array.isArray(data.parts) ? parts : ['apps', 'looks', 'reading'],
      settings: data.settings as unknown as Settings,
      local: isObj(data.local) ? data.local : {},
    };
  }
  // An older "Export" was just the settings object.
  if (Array.isArray(data.apps) || typeof data.version === 'number' || isObj(data.rail)) {
    return { kind: 'sidegig-setup', format: 1, name: fallbackName, created: Date.now(), parts: ['apps', 'looks', 'reading'], settings: data as unknown as Settings, local: {} };
  }
  throw new Error('Not a sidegig setup');
}

const b64 = {
  enc(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(text: string): Uint8Array {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** A short code to paste into another browser: compressed, URL-safe. Pictures stay out (too big). */
export async function toCode(bundle: SetupBundle): Promise<string> {
  const pics = (k: string) => LOCAL_KEYS.pictures.some((p) => (isPrefixKey(p) ? k.startsWith(p.slice(0, -1)) : k === p));
  const slim: SetupBundle = { ...bundle, parts: bundle.parts.filter((p) => p !== 'pictures'), local: Object.fromEntries(Object.entries(bundle.local).filter(([k]) => !pics(k))) };
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  return CODE_PREFIX + b64.enc(await pipe(bytes, new CompressionStream('deflate-raw')));
}

/** Read a setup from pasted text: a code, or the contents of a setup file. */
export async function parseSetup(text: string, fallbackName?: string): Promise<SetupBundle> {
  const t = text.trim();
  if (t.length > MAX_SETUP_BYTES * 1.4) throw new Error('That’s too big to be a sidegig setup');
  if (t.startsWith(CODE_PREFIX)) {
    let json: string;
    try {
      json = new TextDecoder().decode(await pipe(b64.dec(t.slice(CODE_PREFIX.length).replace(/\s+/g, '')), new DecompressionStream('deflate-raw')));
    } catch {
      throw new Error('That code is incomplete. Copy all of it and try again.');
    }
    return toBundle(JSON.parse(json), fallbackName);
  }
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    throw new Error('Not a sidegig setup. Paste a code that starts with “sidegig1:” or choose a setup file.');
  }
  return toBundle(data, fallbackName);
}

export function setupFile(bundle: SetupBundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
}

export const fileName = (bundle: SetupBundle) => `sidegig-${bundle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'setup'}.json`;

/** What a setup contains, in words ("8 apps · Night theme · 3 interests"). */
export function describe(bundle: SetupBundle): string {
  const s = mergeSettings(defaultSettings(), migrate(bundle.settings));
  const bits: string[] = [];
  if (bundle.parts.includes('apps') && Array.isArray(s.apps)) bits.push(`${s.apps.length} app${s.apps.length === 1 ? '' : 's'}`);
  const look = s.newtab.look || 'auto';
  if (bundle.parts.includes('looks')) bits.push(`${look === 'auto' ? 'Match browser' : look[0].toUpperCase() + look.slice(1)} theme`);
  const interests = (bundle.local.edProfile as { interests?: unknown[] } | undefined)?.interests?.length;
  if (bundle.parts.includes('reading') && interests) bits.push(`${interests} interest${interests === 1 ? '' : 's'}`);
  const todos = (bundle.local.ntTodos as unknown[] | undefined)?.length;
  if (bundle.parts.includes('todos') && todos) bits.push(`${todos} to-do${todos === 1 ? '' : 's'}`);
  const pics = (bundle.local.ntUploads as unknown[] | undefined)?.length;
  if (bundle.parts.includes('pictures') && pics) bits.push(`${pics} picture${pics === 1 ? '' : 's'}`);
  return bits.join(', ');
}
