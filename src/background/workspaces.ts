import { ext, features, uid } from '../shared/api.ts';
import { getLocal, setLocal } from '../shared/storage.ts';
import type { Workspace } from '../shared/types.ts';

const restorable = (url?: string) => !!url && /^(https?|file|ftp):/.test(url);

export async function saveWorkspace(name: string): Promise<Workspace> {
  const win = await ext.windows.getLastFocused({ populate: true, windowTypes: ['normal'] as any });
  const groups = new Map<number, { title: string; color: string }>();
  if (features.tabGroups) {
    for (const t of win.tabs ?? []) {
      if (t.groupId !== undefined && t.groupId >= 0 && !groups.has(t.groupId)) {
        try {
          const g = await (ext as any).tabGroups.get(t.groupId);
          groups.set(t.groupId, { title: g.title ?? '', color: g.color ?? 'grey' });
        } catch {
          /* group vanished */
        }
      }
    }
  }
  const ws: Workspace = {
    id: uid('ws_'),
    name: name.trim() || new Date().toLocaleString(),
    created: Date.now(),
    tabs: (win.tabs ?? [])
      .filter((t) => restorable(t.url))
      .map((t) => ({ url: t.url!, title: t.title ?? t.url!, pinned: !!t.pinned, group: t.groupId !== undefined && t.groupId >= 0 ? groups.get(t.groupId) : undefined })),
  };
  const all = await getLocal<Workspace[]>('workspaces', []);
  await setLocal('workspaces', [ws, ...all]);
  return ws;
}

export async function restoreWorkspace(id: string): Promise<void> {
  const all = await getLocal<Workspace[]>('workspaces', []);
  const ws = all.find((w) => w.id === id);
  if (!ws?.tabs.length) return;
  const win = await ext.windows.create({ url: ws.tabs[0].url, focused: true });
  const created: { id: number; group?: Workspace['tabs'][number]['group'] }[] = [];
  const first = win?.tabs?.[0];
  if (first?.id !== undefined) {
    if (ws.tabs[0].pinned) await ext.tabs.update(first.id, { pinned: true });
    created.push({ id: first.id, group: ws.tabs[0].group });
  }
  for (const t of ws.tabs.slice(1)) {
    const tab = await ext.tabs.create({ windowId: win!.id, url: t.url, pinned: t.pinned, active: false });
    if (tab.id !== undefined) created.push({ id: tab.id, group: t.group });
  }
  if (!features.tabGroups) return;
  const byTitle = new Map<string, { ids: number[]; color: string }>();
  for (const c of created) {
    if (!c.group) continue;
    const key = `${c.group.title}\u0000${c.group.color}`;
    const entry = byTitle.get(key) ?? { ids: [], color: c.group.color };
    entry.ids.push(c.id);
    byTitle.set(key, entry);
  }
  for (const [key, { ids, color }] of byTitle) {
    const groupId = await (ext.tabs as any).group({ tabIds: ids, createProperties: { windowId: win!.id } });
    await (ext as any).tabGroups.update(groupId, { title: key.split('\u0000')[0], color });
  }
}

/** Unload background tabs to free memory. Pinned, playing and active tabs stay. */
export async function sleepTabs(olderThanMin = 0): Promise<number> {
  const tabs = await ext.tabs.query({});
  const cutoff = Date.now() - olderThanMin * 60000;
  let n = 0;
  for (const t of tabs) {
    if (t.active || t.pinned || t.audible || t.discarded || t.id === undefined) continue;
    const last = (t as any).lastAccessed as number | undefined;
    if (olderThanMin > 0 && last !== undefined && last > cutoff) continue;
    try {
      await ext.tabs.discard(t.id);
      n++;
    } catch {
      /* some tabs can't be discarded */
    }
  }
  return n;
}
