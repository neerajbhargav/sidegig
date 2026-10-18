// Native panel lifetime belongs to the worker. Closing a panel can destroy its
// page before an asynchronous pagehide storage write finishes.
import { ext } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';

type Panels = Record<string, { side: string; ts: number }>;

export function trackPanels() {
  const owners = new Map<string, chrome.runtime.Port>();
  let writes: Promise<unknown> = Promise.resolve();
  const change = (mutate: (panels: Panels) => void) => {
    writes = writes.then(async () => {
      const panels = await getLocal<Panels>('panelOpen', {});
      mutate(panels);
      await setLocal('panelOpen', panels);
    }).catch(() => undefined);
  };
  ext.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidegig-panel') return;
    const sender = port.sender;
    if (sender?.id !== ext.runtime.id || sender.tab || sender.url?.split(/[?#]/)[0] !== ext.runtime.getURL('panel.html')) return port.disconnect();
    let key: string | undefined;
    let closed = false;
    port.onMessage.addListener((data) => {
      if (closed || !Number.isInteger(data?.windowId) || data.windowId < 0 || !['left', 'right'].includes(data.side)) return;
      const wid = String(data.windowId);
      if (key && key !== wid) return;
      key = wid;
      owners.set(wid, port);
      change((panels) => { if (!closed && owners.get(wid) === port) panels[wid] = { side: data.side, ts: Date.now() }; });
    });
    port.onDisconnect.addListener(() => {
      closed = true;
      if (!key || owners.get(key) !== port) return;
      const wid = key;
      owners.delete(wid);
      change((panels) => { if (!owners.has(wid)) delete panels[wid]; });
    });
  });
}
