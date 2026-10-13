// Opening apps in the right place. Anything that needs a user gesture
// (side panel / sidebar) is called synchronously before any await.
import { ext, features, TARGET } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import type { OpenIn, Side } from '../shared/types.ts';
import type { View } from '../shared/messages.ts';

export interface OpenRequest { appId?: string; url: string; openIn: OpenIn; side: Side; view?: View }

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};

/** Ask the panel page to show an app or view. It listens to this key. */
function requestPanel(req: { appId?: string; view?: View }) {
  void setLocal('panelRequest', { ...req, ts: Date.now() });
}

/**
 * Open the browser's own sidebar with sidegig's panel. Returns false when this
 * browser has no sidebar we can open (caller falls back to a mini window).
 */
export function openPanel(windowId: number | undefined, req: { appId?: string; view?: View }): boolean {
  if (features.sidePanel && windowId !== undefined) {
    requestPanel(req);
    const sp = (ext as any).sidePanel;
    sp.open({ windowId }).catch(() => sp.setOptions({ enabled: true }).then(() => sp.open({ windowId })).catch(() => undefined));
    return true;
  }
  const sa = (ext as any).sidebarAction;
  if (sa?.open && TARGET === 'firefox') {
    requestPanel(req);
    sa.open().catch(() => undefined);
    return true;
  }
  return false;
}

export function openApp(req: OpenRequest, windowId: number | undefined): void {
  if (req.openIn === 'panel') {
    if (openPanel(windowId, { appId: req.appId, view: req.view })) return;
    void openMiniWindow(req, windowId);
    return;
  }
  if (req.openIn === 'window') void openMiniWindow(req, windowId);
  else if (req.openIn === 'tab') void openOrFocusTab(req.url);
  // 'drawer' is handled by the rail inside the page.
}

interface Dock {
  main: number;
  bounds: { left: number; top: number; width: number; height: number };
  state: string;
  key: string;
}

/**
 * A slim side window docked next to the browser, like Opera's sidebar: the
 * browser window shrinks to make room (so nothing is covered) and gets its
 * size back when the side window closes. One side window per browser window;
 * opening another app reuses it.
 */
export async function openMiniWindow(req: OpenRequest, windowId?: number): Promise<void> {
  const key = req.appId ?? hostOf(req.url);
  const docks = await getLocal<Record<string, Dock>>('docks', {});
  let main: chrome.windows.Window;
  try {
    main = windowId !== undefined ? await ext.windows.get(windowId) : await ext.windows.getLastFocused();
  } catch {
    main = { left: 0, top: 0, width: 1280, height: 800, state: 'normal' } as chrome.windows.Window;
  }
  // Already docked to this window: switch it to this app.
  const existing = Object.entries(docks).find(([, d]) => d.main === main.id);
  if (existing) {
    const id = Number(existing[0]);
    try {
      const [tab] = await ext.tabs.query({ windowId: id });
      if (tab?.id !== undefined && existing[1].key !== key) await ext.tabs.update(tab.id, { url: req.url });
      await ext.windows.update(id, { focused: true });
      docks[id] = { ...existing[1], key };
      await setLocal('docks', docks);
      return;
    } catch {
      delete docks[id];
    }
  }
  // A side window opened from elsewhere (no browser window to dock to).
  const popups = await getLocal<Record<string, number>>('popups', {});
  if (main.id === undefined && popups[key] !== undefined) {
    try {
      await ext.windows.update(popups[key], { focused: true });
      return;
    } catch {
      delete popups[key];
    }
  }
  const bounds = { left: main.left ?? 0, top: main.top ?? 0, width: main.width ?? 1280, height: main.height ?? 800 };
  const width = Math.round(Math.min(480, Math.max(380, bounds.width * 0.28)));
  const left = req.side === 'left' ? bounds.left : bounds.left + bounds.width - width;
  let dock: Dock | null = null;
  // Make room unless the browser is full screen (then the side window floats over it).
  if (main.id !== undefined && main.state !== 'fullscreen' && bounds.width - width >= 640) {
    try {
      if (main.state === 'maximized') await ext.windows.update(main.id, { state: 'normal' });
      await ext.windows.update(main.id, { left: req.side === 'left' ? bounds.left + width : bounds.left, top: bounds.top, width: bounds.width - width, height: bounds.height });
      dock = { main: main.id, bounds, state: main.state ?? 'normal', key };
    } catch {
      dock = null;
    }
  }
  const win = await ext.windows.create({ url: req.url, type: 'popup', width, height: bounds.height, left, top: bounds.top, focused: true });
  if (win?.id === undefined) return;
  popups[key] = win.id;
  await setLocal('popups', popups);
  if (dock) {
    docks[win.id] = dock;
    await setLocal('docks', docks);
  }
}

export async function openOrFocusTab(url: string): Promise<void> {
  const host = hostOf(url);
  if (host) {
    const [tab] = await ext.tabs.query({ url: `*://${host}/*` });
    if (tab?.id !== undefined) {
      await ext.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) await ext.windows.update(tab.windowId, { focused: true });
      return;
    }
  }
  await ext.tabs.create({ url });
}

export async function forgetPopup(windowId: number): Promise<void> {
  const popups = await getLocal<Record<string, number>>('popups', {});
  const next = Object.fromEntries(Object.entries(popups).filter(([, id]) => id !== windowId));
  if (Object.keys(next).length !== Object.keys(popups).length) await setLocal('popups', next);
  // A docked side window closed: give the browser window its room back.
  const docks = await getLocal<Record<string, Dock>>('docks', {});
  const d = docks[windowId];
  if (!d) return;
  delete docks[windowId];
  await setLocal('docks', docks);
  try {
    await ext.windows.update(d.main, { ...d.bounds });
    if (d.state === 'maximized') await ext.windows.update(d.main, { state: 'maximized' });
  } catch {
    /* the browser window is gone too */
  }
}
