import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupJson } from '../src/background/backup.ts';
import { defaultSettings } from '../src/shared/defaults.ts';
import { parseSetup } from '../src/shared/setups.ts';

const local = {
  ntNotes: [{ id: 'n1', text: 'Keep me', color: 0 }],
  ntTodos: [{ id: 't1', text: 'A task', done: false }],
  aiChats: [{ id: 'c1', title: 'A chat', model: 'local:fixture', created: 1, updated: 2, messages: [{ role: 'user', content: 'Hello' }] }],
  aiKeys: { openai: 'sk-never-in-a-backup' },
  bridgeCode: 'K7QM-2XRP',
  mcpAuth: { s1: { token: 'never' } },
};

test('the weekly backup carries notes, to-dos and chats, never credentials, and imports again', async () => {
  const json = backupJson(defaultSettings(), local, 1_800_000_000_000)!;
  assert.ok(json.includes('Keep me') && json.includes('A task') && json.includes('A chat'));
  for (const secret of ['sk-never-in-a-backup', 'K7QM-2XRP', '"never"']) assert.ok(!json.includes(secret), `${secret} stays out`);
  const parsed = await parseSetup(json);
  assert.ok(parsed, 'Settings > Setups can import it');
  assert.equal(parsed!.created, 1_800_000_000_000);
});

test('a huge chat history is left out rather than making the backup unusable', () => {
  const big = { ...local, aiChats: [{ id: 'c', title: 'x', model: 'local:fixture', created: 1, updated: 2, messages: [{ role: 'user', content: 'y'.repeat(13 * 1024 * 1024) }] }] };
  const json = backupJson(defaultSettings(), big, 1)!;
  assert.ok(!json.includes('yyyy'));
  assert.ok(json.includes('Keep me'));
});

test('the size limit counts bytes, as the importer does', async () => {
  const { MAX_SETUP_BYTES } = await import('../src/shared/setups.ts');
  // Characters that take three bytes each: under the limit in characters, over it in bytes.
  const wide = { ...local, aiChats: [{ id: 'c', title: 'x', model: 'local:fixture', created: 1, updated: 2, messages: [{ role: 'user', content: '語'.repeat(Math.floor(MAX_SETUP_BYTES / 2.5)) }] }] };
  const json = backupJson(defaultSettings(), wide, 1)!;
  assert.ok(new TextEncoder().encode(json).length <= MAX_SETUP_BYTES, 'fits the importer');
  assert.ok(await parseSetup(json), 'and imports');
});
