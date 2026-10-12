// Shared state and actions for the drawer, the browser sidebar panel and the new tab page.
import { ext, features, TARGET } from '../shared/api.ts';
import { setLocal } from '../shared/storage.ts';
import type { AppEntry, Settings } from '../shared/types.ts';
import type { ToBackground } from '../shared/messages.ts';

export type ViewName = 'home' | 'search' | 'status' | 'settings' | 'app' | 'add';
export type Kind = 'drawer' | 'panel' | 'newtab';

export interface Ctx {
  kind: Kind;
  settings: Settings;
  /** Window this page lives in (needed to open the side panel synchronously). */
  windowId?: number;
  /** The tab hosting the drawer. */
  tabId?: number;
  go(view: ViewName, opts?: { app?: string; q?: string }): void;
  close(): void;
  /** Ask the rail in the hosting page to do something (drawer only). */
  toRail(msg: Record<string, unknown>): void;
}

export const send = (m: ToBackground) => ext.runtime.sendMessage(m);

export async function activeTab(ctx: Ctx): Promise<chrome.tabs.Tab | undefined> {
  if (ctx.kind === 'drawer' && ctx.tabId !== undefined) return ext.tabs.get(ctx.tabId).catch(() => undefined);
  const q = ctx.windowId !== undefined ? { active: true, windowId: ctx.windowId } : { active: true, lastFocusedWindow: true };
  const [t] = await ext.tabs.query(q);
  return t;
}

/** Open a URL: in the page you're on by default, or a new tab with a modifier key. */
export async function openUrl(ctx: Ctx, url: string, e?: MouseEvent | KeyboardEvent) {
  const newTab = !!e && (e.metaKey || e.ctrlKey || ('button' in e && e.button === 1));
  if (newTab) {
    await ext.tabs.create({ url, active: !e!.shiftKey, windowId: ctx.windowId });
    return;
  }
  if (ctx.kind === 'newtab') {
    location.href = url;
    return;
  }
  const tab = await activeTab(ctx);
  if (tab?.id !== undefined) await ext.tabs.update(tab.id, { url });
  else await ext.tabs.create({ url });
  if (ctx.kind === 'drawer') ctx.close();
}

export async function switchTo(tab: chrome.tabs.Tab) {
  if (tab.id === undefined) return;
  await ext.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await ext.windows.update(tab.windowId, { focused: true });
}

/**
 * Open an app. The side panel must open synchronously inside the click, so
 * this function does that before anything async.
 */
export function openApp(ctx: Ctx, app: AppEntry) {
  const side = ctx.settings.rail.side;
  if (ctx.kind === 'panel' && (app.openIn === 'panel' || app.openIn === 'drawer')) return ctx.go('app', { app: app.id });
  if (app.openIn === 'drawer' && ctx.kind === 'drawer') return ctx.go('app', { app: app.id });
  if (app.openIn === 'panel') {
    if (features.sidePanel && ctx.windowId !== undefined) {
      void setLocal('panelRequest', { appId: app.id, ts: Date.now() });
      (ext as any).sidePanel.open({ windowId: ctx.windowId }).catch(() => undefined);
      return;
    }
    const sa = (ext as any).sidebarAction;
    if (TARGET === 'firefox' && sa?.open) {
      void setLocal('panelRequest', { appId: app.id, ts: Date.now() });
      sa.open().catch(() => undefined);
      return;
    }
  }
  void send({ type: 'open-app', appId: app.id, url: app.url, openIn: app.openIn === 'drawer' ? 'panel' : app.openIn, side }).catch(() => undefined);
}

export function openOptions(section?: string) {
  const url = ext.runtime.getURL(`options.html${section ? '#' + section : ''}`);
  void ext.tabs.create({ url });
}
