import type { OpenIn, Side } from './types.ts';

/** Messages sent to the background service worker. Site messages name no host:
 * the worker takes it from the sender (see background/trust.ts). */
export type ToBackground =
  | { type: 'open-app'; appId: string; url: string; openIn: OpenIn; side: Side }
  | { type: 'clear-sw'; url: string }
  | { type: 'frame-cookies' }
  | { type: 'ask-ai'; appId: string; url: string; openIn: OpenIn; side: Side; prompt: string; autoSend: boolean }
  | { type: 'badge'; count: number }
  | { type: 'ai-claim' }
  | { type: 'ask-page' }
  | { type: 'tab-info' }
  | { type: 'save-workspace'; name: string }
  | { type: 'restore-workspace'; id: string }
  | { type: 'sleep-tabs' }
  | { type: 'refresh-status' }
  | { type: 'edition-build' }
  | { type: 'profile-import'; text: string };

/** Messages sent from the background to a tab's rail. */
export type ToContent =
  | { type: 'toggle-rail' }
  | { type: 'open-view'; view: View };

export type View = 'home' | 'search' | 'status' | 'settings' | 'add' | 'chat';
