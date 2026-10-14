import { ext } from './api.ts';
import { defaultSettings, SETTINGS_VERSION } from './defaults.ts';
import { NO_FRAME } from './catalog.ts';
import type { Settings, Secrets } from './types.ts';

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge stored settings over defaults. Only keys that exist in the defaults
 * survive (so old or corrupt keys can't leak in); arrays are replaced whole;
 * values with the wrong type fall back to the default.
 */
export function mergeSettings<T>(defaults: T, stored: unknown): T {
  if (!isObj(defaults) || !isObj(stored)) return defaults;
  const out: Plain = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const d = (defaults as Plain)[key];
    const s = stored[key];
    if (s === undefined || s === null) continue;
    if (isObj(d)) out[key] = mergeSettings(d, s);
    else if (Array.isArray(d)) out[key] = Array.isArray(s) ? s : d;
    else if (typeof s === typeof d) out[key] = s;
  }
  return out as T;
}

export function migrate(stored: unknown): unknown {
  if (!isObj(stored)) return stored;
  const v = typeof stored.version === 'number' ? stored.version : 0;
  if (v >= SETTINGS_VERSION) return stored;
  const next: Plain = { ...stored };
  // v1 -> v2: the floating "pinned" rail became the Opera-style docked rail.
  if (v < 2 && isObj(next.rail) && next.rail.mode === 'pinned') next.rail = { ...next.rail, mode: 'docked' };
  // v3 -> v4: the single wallpaper choice became a background (kind, treatment, dim, blur).
  if (v < 4 && isObj(next.newtab) && typeof next.newtab.wallpaper === 'string') {
    const w = next.newtab.wallpaper;
    const kind = w === 'custom' ? 'upload' : w === 'daily' || w === 'monuments' ? w : 'none';
    next.newtab = { ...next.newtab, background: { kind, ref: kind === 'upload' ? 'legacy' : '', treatment: 'auto', dim: 35, blur: 0 } };
  }
  // v4 -> v5: the "ntp–1" tag was decoration nobody could read; it's off unless you write your own.
  if (v < 5 && isObj(next.newtab) && next.newtab.tag === 'ntp–1') next.newtab = { ...next.newtab, tag: '' };
  // v5 -> v6: Gmail, X and friends refuse to run inside a page; they open in a docked side window.
  if (v < 6 && Array.isArray(next.apps)) {
    next.apps = next.apps.map((a: unknown) =>
      isObj(a) && typeof a.catalogId === 'string' && NO_FRAME.has(a.catalogId) && (a.openIn === 'panel' || a.openIn === 'drawer') ? { ...a, openIn: 'window' } : a,
    );
  }
  // v6 -> v7: the new tab became a dashboard. Weather you turned off stays off.
  if (v < 7 && isObj(next.newtab) && isObj(next.newtab.weather) && next.newtab.weather.place && next.newtab.weather.enabled === false) {
    next.newtab = { ...next.newtab, widgets: { ...(isObj(next.newtab.widgets) ? next.newtab.widgets : {}), weather: false } };
  }
  // v7 -> v8: widgets sit on a grid and Clear became readable on its own, so
  // everyone moves to it once. The wallpaper effect stops depending on the
  // colours: "auto" becomes whatever it showed, and changing colours no longer
  // changes the picture.
  // v9 -> v10: Gmail, X and the rest load inside the sidebar (the frame helper lets
  // them start there), so the side window is no longer their default.
  if (v < 10 && Array.isArray(next.apps)) {
    next.apps = (next.apps as Plain[]).map((a) => (a.openIn === 'window' && ['gmail', 'x', 'grok', 'instagram', 'messenger'].includes(String(a.catalogId ?? '')) ? { ...a, openIn: 'panel' } : a));
  }
  // v8 -> v9: sites with a good phone layout use it in the narrow sidebar and
  // side window, so they fit.
  if (v < 9 && Array.isArray(next.apps)) {
    next.apps = (next.apps as Plain[]).map((a) => {
      const cat = String(a.catalogId ?? '');
      const out = { ...a };
      if (['x', 'calendar', 'instagram', 'reddit', 'linkedin', 'ytmusic', 'grok'].includes(cat)) out.mobile = true;
      if (cat === 'gmail') out.mobile = false;
      return out;
    });
    if (isObj(next.drawer) && Number(next.drawer.width) < 400) next.drawer = { ...next.drawer, width: 400 };
  }
  if (v < 8 && isObj(next.newtab)) {
    const nt = next.newtab as Plain;
    nt.panels = 'clear';
    const bg = isObj(nt.background) ? (nt.background as Plain) : null;
    if (bg && (bg.treatment === 'auto' || !bg.treatment)) bg.treatment = autoEffect(String(bg.kind ?? ''), String(bg.ref ?? ''), String(nt.look ?? 'auto'));
  }
  // v2 -> v3: the new tab edition arrived; defaults fill it in.
  next.version = SETTINGS_VERSION;
  return next;
}

/** What the old "auto" wallpaper effect resolved to (kept so a migrated page looks the same). */
export function autoEffect(kind: string, ref: string, look: string): 'photo' | 'print' | 'film' {
  if (kind === 'monuments' || ref.startsWith('m:')) return 'print';
  if (look === 'auto' || look === 'picture') return 'photo';
  if (kind === 'collection' || kind === 'upload' || kind === 'url') return 'film';
  return 'print';
}

const syncArea = () => ext?.storage?.sync ?? ext?.storage?.local;
const localArea = () => ext.storage.local;

export async function loadSettings(): Promise<Settings> {
  const [synced, local] = await Promise.all([
    syncArea().get('settings').catch(() => ({}) as Plain),
    localArea().get(['settings', 'customCss']),
  ]);
  // Prefer the synced copy; fall back to a local copy written when sync was full.
  const raw = (synced as Plain).settings ?? (local as Plain).settings;
  const s = mergeSettings(defaultSettings(), migrate(raw));
  s.theme.customCss = typeof (local as Plain).customCss === 'string' ? ((local as Plain).customCss as string) : '';
  return s;
}

export async function saveSettings(next: Settings): Promise<void> {
  const { customCss, ...theme } = next.theme;
  const toStore = { ...next, theme: { ...theme, customCss: '' } };
  await localArea().set({ customCss });
  try {
    await syncArea().set({ settings: toStore });
  } catch {
    // Sync quota exceeded or unavailable: keep a device-local copy instead.
    await localArea().set({ settings: toStore });
  }
}

export async function updateSettings(mutate: (s: Settings) => void): Promise<Settings> {
  const s = await loadSettings();
  mutate(s);
  await saveSettings(s);
  return s;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>) => {
    if ('settings' in changes || 'customCss' in changes) loadSettings().then(cb);
  };
  ext.storage.onChanged.addListener(listener);
  return () => ext.storage.onChanged.removeListener(listener);
}

export async function loadSecrets(): Promise<Secrets> {
  const { secrets } = await localArea().get('secrets');
  return (secrets as Secrets) ?? {};
}

export async function saveSecrets(next: Secrets): Promise<void> {
  await localArea().set({ secrets: next });
}

/** Small typed helpers for device-local runtime state. */
export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const r = await localArea().get(key);
  return (r as Plain)[key] === undefined ? fallback : ((r as Plain)[key] as T);
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  await localArea().set({ [key]: value });
}

export function onLocalChanged(key: string, cb: (value: unknown) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && key in changes) cb(changes[key].newValue);
  };
  ext.storage.onChanged.addListener(listener);
  return () => ext.storage.onChanged.removeListener(listener);
}
