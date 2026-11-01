import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, nativeAi, providerOrder, ASIDE_EXTENSION } from '../src/shared/browserai.ts';

test('native AI: Aside wins when its agent answers; otherwise by brand', () => {
  assert.deepEqual(nativeAi({ brands: ['Chromium'], aside: true }), { id: 'aside', browser: 'Aside', provider: 'aside', ntp: `chrome-extension://${ASIDE_EXTENSION}/newtab.html` });
  assert.equal(nativeAi({ brands: ['Chromium'], arc: true }).id, 'arc');
  assert.equal(nativeAi({ brands: ['Chromium', 'Google Chrome'] }).ntp, 'chrome://new-tab-page/', 'Chrome’s own NTP stays reachable under an override');
  assert.equal(nativeAi({ brands: [], target: 'firefox' }).ntp, 'about:home');
  assert.equal(nativeAi({ brands: ['Chromium', 'Microsoft Edge'] }).provider, 'copilot');
  assert.equal(nativeAi({ brands: ['Chromium', 'Brave'], brave: true }).provider, 'leo');
  assert.equal(nativeAi({ brands: ['Chromium', 'Google Chrome'] }).provider, 'gemini');
  assert.equal(nativeAi({ brands: ['Chromium', 'Opera'] }).provider, undefined);
  assert.equal(nativeAi({ brands: ['Chromium'] }).id, 'chromium');
});

test('provider order: browser AI first, then your pick, no duplicates', () => {
  const ids = providerOrder('aside', 'claude').map((p) => p.id);
  assert.equal(ids[0], 'aside');
  assert.equal(ids[1], 'claude');
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(providerOrder(undefined, 'nope')[0].id, 'claude');
});

test('ask URLs carry the question; Aside goes to its own new chat', () => {
  assert.equal(PROVIDERS.claude.ask!('a b&c'), 'https://claude.ai/new?q=a%20b%26c');
  assert.equal(PROVIDERS.aimode.ask!('x'), 'https://www.google.com/search?udm=50&q=x');
  assert.equal(PROVIDERS.aside.ask, undefined);
  assert.equal(PROVIDERS.aside.newChat, `chrome-extension://${ASIDE_EXTENSION}/main.html#/u/0/tasks/new`);
  assert.equal(PROVIDERS.gemini.ask, undefined, 'Gemini has no ask URL: sidegig types it in');
  assert.equal(PROVIDERS.gemini.appId, 'gemini');
});

// Aside 154 ships a stub Prompt API: "available", but it answers with debug text and the prompt itself
// ("CPU backendFastest inference…User: <prompt> End.Model: "). Seen live on 2026-10-31.
test('built-in model: a stub that echoes the prompt counts as unavailable, a working one as available', async () => {
  const { builtinState } = await import('../src/shared/ai/providers.ts');
  const g = globalThis as { LanguageModel?: unknown };
  const fake = (reply: (p: string) => string) => ({
    availability: async () => 'available',
    create: async () => ({ prompt: async (p: string) => reply(p), destroy: () => undefined }),
  });
  try {
    g.LanguageModel = fake((p) => `CPU backendFastest inferenceTopK: 64, Temp: 1User: ${p} End.Model: `);
    assert.equal(await builtinState(), 'unavailable');
    g.LanguageModel = fake(() => 'ok');
    assert.equal(await builtinState(), 'available');
  } finally {
    delete g.LanguageModel;
  }
});
