// Preview-only stand-in for the extension APIs, so sidegig's real UI code can
// run inside an ordinary page for screenshots and UI checks. Never shipped.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Listener = (...a: any[]) => any;
const ev = () => {
  const ls: Listener[] = [];
  return { addListener: (f: Listener) => ls.push(f), removeListener: (f: Listener) => ls.splice(ls.indexOf(f), 1), fire: (...a: any[]) => ls.forEach((f) => f(...a)), hasListeners: () => ls.length > 0 };
};

const fx = (globalThis as any).__SIDEGIG_FIXTURES__ ?? {};
const log: any[] = ((globalThis as any).__SIDEGIG_LOG__ = []);

function area(name: string, data: Record<string, any>, changed: ReturnType<typeof ev>) {
  return {
    async get(keys?: string | string[] | Record<string, any> | null) {
      if (keys == null) return structuredClone(data);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, any> = {};
      for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj: Record<string, any>) {
      const changes: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
        data[k] = structuredClone(v);
      }
      setTimeout(() => changed.fire(changes, name), 0);
    },
    async remove(k: string) {
      delete data[k];
    },
  };
}

const onChanged = ev();
const tree = fx.bookmarks ?? [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [] }] }];
const byId = new Map<string, any>();
const index = (n: any, parentId?: string) => {
  n.parentId = parentId;
  byId.set(n.id, n);
  for (const c of n.children ?? []) index(c, n.id);
};
tree.forEach((n: any) => index(n));
const strip = (n: any) => ({ id: n.id, title: n.title, url: n.url, parentId: n.parentId, children: n.children ? n.children.map(strip) : undefined });

const tabs: any[] = fx.tabs ?? [];
const historyItems: any[] = fx.history ?? [];

const mock: any = {
  storage: { local: area('local', fx.local ?? {}, onChanged), sync: area('sync', fx.sync ?? {}, onChanged), onChanged },
  runtime: {
    id: 'preview',
    getURL: (p: string) => `https://margin.preview/${p.replace(/^\//, '')}`,
    async sendMessage(m: any) {
      log.push(m);
      if (m.type === 'tab-info') return { tabId: 1, windowId: 1, popup: false };
      if (m.type === 'refresh-status') return fx.local?.status ?? [];
      if (m.type === 'sleep-tabs') return 4;
      if (m.type === 'ai-claim') return null;
      return undefined;
    },
    onMessage: ev(),
    openOptionsPage: () => log.push({ type: 'open-options' }),
  },
  tabs: {
    async query() {
      return structuredClone(tabs);
    },
    async get(id: number) {
      return structuredClone(tabs.find((t: any) => t.id === id) ?? tabs[0]);
    },
    async getCurrent() {
      return structuredClone(tabs.find((t: any) => t.active) ?? tabs[0]);
    },
    async update(id: number, p: any) {
      log.push({ type: 'tabs.update', id, ...p });
      return {};
    },
    async create(p: any) {
      log.push({ type: 'tabs.create', ...p });
      return {};
    },
    async remove(id: number) {
      log.push({ type: 'tabs.remove', id });
    },
    async discard() {},
    async group() {
      return 1;
    },
    async sendMessage() {},
    onRemoved: ev(),
    onCreated: ev(),
    onActivated: ev(),
    onUpdated: ev(),
  },
  windows: {
    async getCurrent() {
      return { id: 1, type: 'normal' };
    },
    async get() {
      return { id: 1, type: 'normal', left: 0, top: 0, width: 1440, height: 900 };
    },
    async update() {},
    async create(p: any) {
      log.push({ type: 'windows.create', ...p });
      return { id: 2 };
    },
  },
  bookmarks: {
    async getTree() {
      return tree.map(strip);
    },
    async getChildren(id: string) {
      return (byId.get(id)?.children ?? []).map(strip);
    },
    async get(ids: string | string[]) {
      return (Array.isArray(ids) ? ids : [ids]).map((i) => byId.get(i)).filter(Boolean).map(strip);
    },
    async create(p: any) {
      log.push({ type: 'bookmarks.create', ...p });
      return p;
    },
    onCreated: ev(),
    onRemoved: ev(),
    onChanged: ev(),
  },
  tabGroups: {
    async query() {
      return structuredClone(fx.groups ?? []);
    },
    async get(id: number) {
      return (fx.groups ?? []).find((g: any) => g.id === id);
    },
  },
  history: {
    async search({ text }: { text: string }) {
      const q = text.toLowerCase();
      return historyItems.filter((x: any) => (x.title + x.url).toLowerCase().includes(q));
    },
  },
  permissions: { request: async () => true },
  search: { query: (p: any) => log.push({ type: 'search', ...p }) },
};

(globalThis as any).chrome = mock;
export {};
