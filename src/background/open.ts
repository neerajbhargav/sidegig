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
 * Open the browser's own sidebar with Margin's panel. Returns false when this
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

/** A slim popup window docked to the side of the current window. */
export async function openMiniWindow(req: OpenRequest, windowId?: number): Promise<void> {
  const key = req.appId ?? hostOf(req.url);
  const popups = await getLocal<Record<string, number>>('popups', {});
  const existing = popups[key];
  if (existing !== undefined) {
    try {
      await ext.windows.update(existing, { focused: true });
      return;
    } catch {
      delete popups[key];
    }
  }
  let bounds = { left: 0, top: 0, width: 1280, height: 800 };
  try {
    const w = windowId !== undefined ? await ext.windows.get(windowId) : await ext.windows.getLastFocused();
    bounds = { left: w.left ?? 0, top: w.top ?? 0, width: w.width ?? 1280, height: w.height ?? 800 };
  } catch {
    /* use defaults */
  }
  const width = Math.round(Math.min(460, Math.max(360, bounds.width * 0.3)));
  const left = req.side === 'left' ? bounds.left : bounds.left + bounds.width - width;
  const win = await ext.windows.create({ url: req.url, type: 'popup', width, height: bounds.height, left, top: bounds.top, focused: true });
  if (win?.id !== undefined) {
    popups[key] = win.id;
    await setLocal('popups', popups);
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
}
