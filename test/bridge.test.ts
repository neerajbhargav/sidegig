// The local bridge refuses extensions without the pairing code, and drops
// frames a browser would never send. Runs the real script on a spare port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PORT = 47700 + Math.floor(Math.random() * 200);
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sidegig-bridge-test-'));
const SCRIPT = path.resolve('bridge/sidegig-bridge.mjs');
// No Codex on PATH: the hello answers at once.
const env = { HOME, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, SIDEGIG_BRIDGE_PORT: String(PORT) };

function frame(obj: unknown, masked = true): Buffer {
  const data = Buffer.from(JSON.stringify(obj));
  const mask = crypto.randomBytes(4);
  const head = data.length < 126 ? Buffer.from([0x81, (masked ? 0x80 : 0) | data.length]) : Buffer.from([0x81, (masked ? 0x80 : 0) | 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([head, masked ? mask : Buffer.alloc(0), masked ? Buffer.from(data.map((b, i) => b ^ mask[i & 3])) : data]);
}

/** A raw WebSocket client: connect as an extension, send frames, collect replies. */
function connect(origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', port = PORT) {
  const sock = net.connect(port, '127.0.0.1');
  const replies: any[] = [];
  let closed = false;
  let buf = Buffer.alloc(0);
  let upgraded = false;
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!upgraded) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      upgraded = buf.subarray(0, end).toString().startsWith('HTTP/1.1 101');
      buf = buf.subarray(end + 4);
    }
    while (buf.length >= 2) {
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) (len = buf.readUInt16BE(2)), (off = 4);
      if (buf.length < off + len) return;
      if ((buf[0] & 0x0f) === 1) replies.push(JSON.parse(buf.subarray(off, off + len).toString()));
      buf = buf.subarray(off + len);
    }
  });
  sock.on('close', () => (closed = true));
  sock.on('error', () => (closed = true));
  const key = crypto.randomBytes(16).toString('base64');
  sock.write(`GET /ext HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`);
  return { sock, replies, isClosed: () => closed, isUpgraded: () => upgraded, send: (o: unknown) => sock.write(frame(o)) };
}

const until = async (f: () => unknown, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (f()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

test('bridge pairing code, frame limits', async (t) => {
  const code = (() => {
    const out = spawn(process.execPath, [SCRIPT, 'setup'], { env });
    return new Promise<string>((resolve) => {
      let s = '';
      out.stdout.on('data', (d) => (s += d));
      out.on('close', () => resolve(/Pairing code[^:]*: ([0-9A-Z-]+)/.exec(s)?.[1] ?? ''));
    });
  })();
  const pair = await code;
  assert.match(pair, /^[2-9A-Z]{4}-[2-9A-Z]{4}$/, 'setup prints a readable code');

  const server = spawn(process.execPath, [SCRIPT], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => {
    server.kill();
    fs.rmSync(HOME, { recursive: true, force: true });
  });
  let log = '';
  server.stderr.on('data', (d) => (log += d));
  assert.ok(await until(() => log.includes('running on')), `bridge started: ${log}`);

  // Wrong code: refused and closed.
  const wrong = connect();
  assert.ok(await until(wrong.isUpgraded));
  wrong.sock.write(frame({ type: 'hello', role: 'page', code: 'AAAA-AAAA' }));
  assert.ok(await until(() => wrong.replies.some((r) => r.type === 'refused')), 'wrong code refused');
  assert.ok(await until(wrong.isClosed), 'and disconnected');
  assert.ok(!wrong.replies.some((r) => r.type === 'ready'), 'no agent token for a wrong code');

  // Messages before a hello are ignored; the right code (any case, any dashes) pairs.
  const good = connect();
  assert.ok(await until(good.isUpgraded));
  good.sock.write(frame({ type: 'codex.run', id: 'x', prompt: 'hi' }));
  good.sock.write(frame({ type: 'hello', role: 'page', code: pair.toLowerCase().replace('-', '') }));
  assert.ok(await until(() => good.replies.some((r) => r.type === 'ready')), 'right code gets ready');
  assert.ok(!good.replies.some((r) => r.id === 'x'), 'nothing ran before the hello');

  // An unmasked frame (no browser sends one) closes the connection.
  good.sock.write(frame({ type: 'ping' }, false));
  assert.ok(await until(good.isClosed), 'unmasked frame drops the socket');

  // A frame announcing more than the limit closes the connection before buffering it.
  const big = connect();
  assert.ok(await until(big.isUpgraded));
  const head = Buffer.alloc(14);
  head[0] = 0x81;
  head[1] = 0x80 | 127;
  head.writeBigUInt64BE(BigInt(64 << 20), 2);
  big.sock.write(head);
  assert.ok(await until(big.isClosed), 'oversized frame drops the socket');

  // Web pages are refused outright.
  const page = connect('https://evil.example');
  assert.ok(await until(page.isClosed));
  assert.ok(!page.isUpgraded());
});

test('bridge: runs are capped and owned per connection, stop on close; only the asked connection answers a tool', async (t) => {
  const port = PORT + 300;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sidegig-bridge-runs-'));
  // A stand-in for the Codex app: signed in, one model; each run records its pid and waits.
  const bin = path.join(home, 'bin');
  const pids = path.join(home, 'pids');
  fs.mkdirSync(bin);
  fs.mkdirSync(pids);
  fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const a = process.argv.slice(2);
if (a[0] === '--version') console.log('codex 0.0.0-test');
else if (a[0] === 'login') console.log('Logged in using ChatGPT');
else if (a[0] === 'debug') console.log(JSON.stringify({ models: [{ slug: 'test', display_name: 'Test', visibility: 'list', supported_reasoning_levels: [] }] }));
else if (a[0] === 'exec') { require('fs').writeFileSync(${JSON.stringify(pids)} + '/' + process.pid, ''); process.stdin.resume(); setTimeout(() => {}, 60000); }
`, { mode: 0o755 });
  const runEnv = { HOME: home, PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, SIDEGIG_BRIDGE_PORT: String(port) };
  const server = spawn(process.execPath, [SCRIPT], { env: runEnv, stdio: ['ignore', 'ignore', 'pipe'] });
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const listed = () => fs.readdirSync(pids).map(Number);
  t.after(() => {
    server.kill();
    for (const pid of listed()) if (alive(pid)) process.kill(pid, 'SIGKILL');
    fs.rmSync(home, { recursive: true, force: true });
  });
  let log = '';
  server.stderr.on('data', (d) => (log += d));
  assert.ok(await until(() => log.includes('running on'), 6000), `bridge started: ${log}`);
  const conf = JSON.parse(fs.readFileSync(path.join(home, '.sidegig/bridge.json'), 'utf8'));
  const open = async (role: string) => {
    const c = connect(undefined, port);
    assert.ok(await until(c.isUpgraded));
    c.send({ type: 'hello', role, code: conf.code });
    assert.ok(await until(() => c.replies.some((r) => r.type === 'ready'), 8000), `${role} paired`);
    return c;
  };
  const a = await open('page');
  const b = await open('page');

  // Three runs at once per connection; the fourth is refused, not queued silently.
  for (const id of ['r1', 'r2', 'r3', 'r4']) a.send({ type: 'codex.run', id, prompt: 'hi' });
  assert.ok(await until(() => a.replies.some((r) => r.type === 'codex.error' && r.id === 'r4' && /Too many/.test(r.message))), 'fourth run refused');
  assert.ok(await until(() => listed().length === 3), 'three runs started');
  // Another connection may reuse an id: runs belong to their connection.
  b.send({ type: 'codex.run', id: 'r1', prompt: 'hi' });
  assert.ok(await until(() => listed().length === 4), 'the same id on another connection starts its own run');
  const fromA = listed().slice(0, 3);
  const fromB = listed().filter((p) => !fromA.includes(p));

  // Closing a connection stops its runs, and only its runs.
  a.sock.destroy();
  assert.ok(await until(() => fromA.every((p) => !alive(p)), 5000), "a closed connection's runs are stopped");
  assert.ok(fromB.every(alive), 'other runs keep going');

  // A tool call goes to the browser connection; a result from anyone else is ignored.
  const host = await open('host');
  const call = fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${conf.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browser_tabs', arguments: {} } }) }).then((r) => r.json());
  assert.ok(await until(() => host.replies.some((r) => r.type === 'tool')), 'the browser was asked');
  const asked = host.replies.find((r) => r.type === 'tool');
  b.send({ type: 'tool.result', id: asked.id, content: [{ type: 'text', text: 'forged' }] });
  await new Promise((r) => setTimeout(r, 200));
  host.send({ type: 'tool.result', id: asked.id, content: [{ type: 'text', text: 'real' }] });
  const answer = await call;
  assert.equal(answer.result.content[0].text, 'real', 'only the asked connection answers');
  b.sock.destroy();
  host.sock.destroy();
});
