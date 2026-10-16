// MCP client: connect the assistant to tools on MCP servers (Notion, GitHub,
// Linear, your own). Streamable HTTP transport, per the MCP spec, with either
// a token you paste or the spec's OAuth sign-in (PKCE + dynamic registration).
import { getLocal, setLocal } from '../storage.ts';
import { sseEvents } from './sse.ts';
import type { ToolCall, ToolDef } from './types.ts';
import type { ToolResult, ToolSet } from './tools.ts';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}
interface Auth {
  /** A pasted token, or an OAuth access token. */
  token?: string;
  refresh?: string;
  expires?: number;
  clientId?: string;
  tokenUrl?: string;
}
const AUTH = 'mcpAuth';
const getAuth = async (id: string) => (await getLocal<Record<string, Auth>>(AUTH, {}))[id] ?? {};
const putAuth = async (id: string, a: Auth | null) => {
  const all = await getLocal<Record<string, Auth>>(AUTH, {});
  if (a) all[id] = a;
  else delete all[id];
  await setLocal(AUTH, all);
};
export const setMcpToken = (id: string, token: string) => putAuth(id, token ? { token } : null);
export const mcpSignedIn = async (id: string) => !!(await getAuth(id)).token;

const PROTOCOL = '2025-06-18';
export class McpAuthNeeded extends Error {
  resourceMetadata: string | null;
  constructor(resourceMetadata: string | null) {
    super('This server needs you to sign in.');
    this.resourceMetadata = resourceMetadata;
  }
}

export class McpClient {
  private session = '';
  private n = 1;
  private version = PROTOCOL;
  server: McpServer;
  constructor(server: McpServer) { this.server = server; }

  private async headers(): Promise<Record<string, string>> {
    const a = await fresh(this.server);
    return {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(a.token ? { authorization: `Bearer ${a.token}` } : {}),
      ...(this.session ? { 'mcp-session-id': this.session } : {}),
      'mcp-protocol-version': this.version,
    };
  }

  async rpc<T = any>(method: string, params: unknown = {}, notify = false, signal?: AbortSignal): Promise<T> {
    const id = this.n++;
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params };
    const res = await fetch(this.server.url, { method: 'POST', headers: await this.headers(), body: JSON.stringify(body), signal, credentials: 'omit' });
    if (res.status === 401) {
      const www = res.headers.get('www-authenticate') ?? '';
      throw new McpAuthNeeded(www.match(/resource_metadata="([^"]+)"/)?.[1] ?? null);
    }
    if (!res.ok && res.status !== 202) throw new Error(`${this.server.name} answered ${res.status}`);
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    if (notify || res.status === 202) return undefined as T;
    const reply = (j: any): T => {
      if (j.error) throw new Error(j.error.message ?? `${this.server.name}: error ${j.error.code}`);
      return j.result as T;
    };
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      for await (const e of sseEvents(res, signal)) {
        let j: any;
        try {
          j = JSON.parse(e.data);
        } catch {
          continue;
        }
        if (j?.id === id) return reply(j);
      }
      throw new Error(`${this.server.name} closed without answering`);
    }
    return reply(await res.json());
  }

  async connect(signal?: AbortSignal) {
    const r = await this.rpc<{ protocolVersion?: string }>('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'sidegig', version: '1' } }, false, signal);
    if (r?.protocolVersion) this.version = r.protocolVersion;
    await this.rpc('notifications/initialized', {}, true, signal);
  }

  async tools(signal?: AbortSignal): Promise<{ name: string; description?: string; inputSchema?: Record<string, unknown> }[]> {
    const all: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] = [];
    let cursor: string | undefined;
    do {
      const r = await this.rpc<{ tools: typeof all; nextCursor?: string }>('tools/list', cursor ? { cursor } : {}, false, signal);
      all.push(...(r?.tools ?? []));
      cursor = r?.nextCursor;
    } while (cursor && all.length < 500);
    return all;
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return this.rpc<{ content?: { type: string; text?: string; mimeType?: string; resource?: { uri?: string; text?: string } }[]; isError?: boolean; structuredContent?: unknown }>('tools/call', { name, arguments: args }, false, signal);
  }
}

// ------------------------------------------------------------ sign-in (OAuth 2.1, as the MCP spec describes)

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const identity = () => (globalThis as { chrome?: typeof chrome }).chrome?.identity;

/** Refresh an expired token if we can. */
async function fresh(s: McpServer): Promise<Auth> {
  const a = await getAuth(s.id);
  if (!a.refresh || !a.expires || Date.now() < a.expires - 60_000 || !a.tokenUrl || !a.clientId) return a;
  try {
    const r = await fetch(a.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.clientId, resource: s.url }) });
    if (!r.ok) return a;
    const t = await r.json();
    const next: Auth = { ...a, token: t.access_token, refresh: t.refresh_token ?? a.refresh, expires: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined };
    await putAuth(s.id, next);
    return next;
  } catch {
    return a;
  }
}

/** Find the server's sign-in service, register sidegig with it, and sign in. */
export async function mcpSignIn(s: McpServer, resourceMetadata: string | null): Promise<void> {
  const id = identity();
  if (!id?.launchWebAuthFlow) throw new Error('This browser can’t open a sign-in window for extensions. Paste a token instead.');
  const origin = new URL(s.url).origin;
  const getJ = async (u: string) => {
    const r = await fetch(u, { credentials: 'omit' });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  };
  // 1. Which authorization server protects this MCP server.
  let issuer = origin;
  try {
    const prm = await getJ(resourceMetadata ?? `${origin}/.well-known/oauth-protected-resource`);
    issuer = prm.authorization_servers?.[0] ?? origin;
  } catch {
    /* older servers: the server is its own issuer */
  }
  // 2. Its endpoints.
  const base = issuer.replace(/\/+$/, '');
  let meta: Record<string, any>;
  try {
    meta = await getJ(`${base}/.well-known/oauth-authorization-server`);
  } catch {
    meta = await getJ(`${base}/.well-known/openid-configuration`);
  }
  const redirect = id.getRedirectURL('mcp');
  // 3. Register sidegig (dynamic client registration).
  let clientId = (await getAuth(s.id)).clientId;
  if (!clientId) {
    if (!meta.registration_endpoint) throw new Error('This server doesn’t let apps register themselves. Paste a token instead.');
    const r = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'sidegig', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    });
    if (!r.ok) throw new Error(`Registration failed (${r.status})`);
    clientId = (await r.json()).client_id as string;
  }
  // 4. Sign in with PKCE.
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId!, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state, resource: s.url });
  if (Array.isArray(meta.scopes_supported) && meta.scopes_supported.length) q.set('scope', meta.scopes_supported.join(' '));
  const back = await id.launchWebAuthFlow({ url: `${meta.authorization_endpoint}?${q}`, interactive: true });
  const u = back ? new URL(back) : null;
  if (!u || u.searchParams.get('state') !== state) throw new Error('Sign-in was cancelled.');
  const code = u.searchParams.get('code');
  if (!code) throw new Error(u.searchParams.get('error_description') ?? 'Sign-in was cancelled.');
  // 5. Trade the code for tokens.
  const r = await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId!, code_verifier: verifier, resource: s.url }) });
  if (!r.ok) throw new Error(`Sign-in failed (${r.status})`);
  const t = await r.json();
  await putAuth(s.id, { token: t.access_token, refresh: t.refresh_token, expires: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined, clientId, tokenUrl: meta.token_endpoint });
}
export const mcpSignOut = (id: string) => putAuth(id, null);

// ------------------------------------------------------------ as tools for the assistant

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'mcp';
export const toolName = (server: string, tool: string) => `${slug(server)}__${tool.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64);

function resultText(r: Awaited<ReturnType<McpClient['call']>>): string {
  const parts = (r?.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : c.type === 'resource' ? c.resource?.text ?? c.resource?.uri ?? '' : `[${c.type}${c.mimeType ? ` ${c.mimeType}` : ''}]`));
  if (!parts.length && r?.structuredContent) parts.push(JSON.stringify(r.structuredContent));
  const t = parts.join('\n').trim();
  return t.length > 30_000 ? `${t.slice(0, 30_000)}\n[…trimmed]` : t || '(no content)';
}

export interface McpStatus {
  server: McpServer;
  state: 'ok' | 'signin' | 'error';
  tools: number;
  message?: string;
}

/** Connect to each enabled server and offer its tools (names prefixed with the server's). */
export async function mcpTools(servers: McpServer[], signal?: AbortSignal): Promise<{ set: ToolSet; status: McpStatus[] }> {
  const defs: ToolDef[] = [];
  const route = new Map<string, { client: McpClient; tool: string; server: string }>();
  const status: McpStatus[] = [];
  await Promise.all(
    servers
      .filter((s) => s.enabled && /^https?:\/\//.test(s.url))
      .map(async (s) => {
        const client = new McpClient(s);
        try {
          await client.connect(signal);
          const tools = await client.tools(signal);
          for (const t of tools) {
            const name = toolName(s.name, t.name);
            route.set(name, { client, tool: t.name, server: s.name });
            defs.push({ name, description: `[${s.name}] ${t.description ?? t.name}`.slice(0, 1024), schema: t.inputSchema ?? { type: 'object', properties: {} } });
          }
          status.push({ server: s, state: 'ok', tools: tools.length });
        } catch (e) {
          status.push({ server: s, state: e instanceof McpAuthNeeded ? 'signin' : 'error', tools: 0, message: (e as Error).message });
        }
      }),
  );
  const run = async (c: ToolCall, callSignal = signal): Promise<ToolResult> => {
    const r = route.get(c.name);
    if (!r) return { content: `There's no tool called ${c.name}.`, error: true };
    try {
      const out = await r.client.call(r.tool, c.args, callSignal);
      return { content: resultText(out), error: !!out?.isError, label: `${r.server}: ${r.tool.replace(/_/g, ' ')}` };
    } catch (e) {
      return { content: (e as Error).message, error: true, label: `${r.server}: ${r.tool.replace(/_/g, ' ')}` };
    }
  };
  const describe = (c: ToolCall) => {
    const r = route.get(c.name);
    return r ? `${r.server}: ${r.tool.replace(/_/g, ' ')}` : c.name;
  };
  return { set: { defs, run, describe }, status };
}
