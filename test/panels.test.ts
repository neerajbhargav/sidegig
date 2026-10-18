import { test } from 'node:test';
import assert from 'node:assert/strict';

const event = () => { const listeners: ((...args: any[]) => void)[] = []; return { addListener: (fn: (...args: any[]) => void) => listeners.push(fn), fire: (...args: any[]) => listeners.forEach((fn) => fn(...args)) }; };
const onConnect = event();
let data: Record<string, any> = {};
(globalThis as any).chrome = { runtime: { id: 'fixture', getURL: (p: string) => `chrome-extension://fixture/${p}`, onConnect }, storage: { local: { get: async (key: string) => ({ [key]: structuredClone(data[key]) }), set: async (value: object) => { Object.assign(data, structuredClone(value)); } } } };
const { trackPanels } = await import('../src/background/panels.ts');
trackPanels();
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const port = (sender: object = { id: 'fixture', url: 'chrome-extension://fixture/panel.html' }) => {
  const p = { name: 'sidegig-panel', sender, onMessage: event(), onDisconnect: event(), closed: false, disconnect() { this.closed = true; this.onDisconnect.fire(); } };
  onConnect.fire(p); return p;
};

test('native panel disconnect removes its window immediately', async () => {
  data = {};
  const p = port(); p.onMessage.fire({ windowId: 1, side: 'right' }); await flush();
  assert.equal(data.panelOpen['1'].side, 'right');
  p.disconnect(); await flush();
  assert.deepEqual(data.panelOpen, {});
});

test('old panel disconnect cannot clear its replacement or another window', async () => {
  data = {};
  const old = port(), fresh = port(), other = port();
  old.onMessage.fire({ windowId: 2, side: 'left' });
  fresh.onMessage.fire({ windowId: 2, side: 'right' });
  other.onMessage.fire({ windowId: 3, side: 'left' });
  old.disconnect(); await flush();
  assert.equal(data.panelOpen['2'].side, 'right'); assert.equal(data.panelOpen['3'].side, 'left');
  fresh.disconnect(); other.disconnect(); await flush(); assert.deepEqual(data.panelOpen, {});
});

test('tabs, foreign senders and invalid window claims cannot hide page rails', async () => {
  data = {};
  for (const sender of [{ id: 'foreign', url: 'chrome-extension://fixture/panel.html' }, { id: 'fixture', url: 'https://example.com' }, { id: 'fixture', url: 'chrome-extension://fixture/panel.html', tab: { id: 1 } }]) {
    const p = port(sender); assert.equal(p.closed, true); p.onMessage.fire({ windowId: 4, side: 'left' });
  }
  const p = port(); for (const value of [{ windowId: '4', side: 'left' }, { windowId: -1, side: 'left' }, { windowId: 4, side: 'bad' }]) p.onMessage.fire(value);
  await flush(); assert.equal(data.panelOpen, undefined); p.disconnect();
});
