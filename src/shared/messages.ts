import type { OpenIn, Side } from './types.ts';

/** Messages sent to the background service worker. */
export type ToBackground =
  | { type: 'open-app'; appId: string; url: string; openIn: OpenIn; side: Side }
  | { type: 'ask-ai'; appId: string; url: string; openIn: OpenIn; side: Side; prompt: string; autoSend: boolean }
  | { type: 'badge'; host: string; count: number }
  | { type: 'ai-claim'; host: string }
  | { type: 'ask-page' }
  | { type: 'tab-info' }
  | { type: 'open-options'; section?: string }
  | { type: 'save-workspace'; name: string }
  | { type: 'restore-workspace'; id: string }
  | { type: 'sleep-tabs' }
  | { type: 'refresh-status' }
  | { type: 'edition-build' }
  | { type: 'profile-import'; text: string; host: string };

/** Messages sent from the background to a tab's rail. */
export type ToContent =
  | { type: 'toggle-rail' }
  | { type: 'open-view'; view: View }
  | { type: 'ask-ai'; selection?: string };

export type View = 'home' | 'search' | 'status' | 'settings' | 'add';

/** Messages between the in-page drawer iframe and the rail (window.postMessage). */
export type DrawerMsg =
  | { ns: 'sidegig'; type: 'close' }
  | { ns: 'sidegig'; type: 'pin'; pinned: boolean }
  | { ns: 'sidegig'; type: 'navigate'; url: string; newTab: boolean }
  | { ns: 'sidegig'; type: 'ready' };
