import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertionReplayKv } from '../dist/assertionReplayKv.js';

const key = `client-assertion-jti:${'a'.repeat(64)}`;
test('atomically claims a verified assertion and delegates unrelated KV operations', async () => {
  const values = new Map();
  const raw = {
    async get(k) { return values.get(k) ?? null; },
    async put(k, v) { values.set(k, v); },
  };
  let used = false;
  const kv = assertionReplayKv(raw, async () => { if (used) return false; used = true; return true; });
  const reads = await Promise.all(Array.from({ length: 20 }, () => kv.get(key)));
  assert.equal(reads.filter((v) => v === null).length, 1);
  assert.equal(reads.filter((v) => v === '1').length, 19);
  await kv.put(key, '1', { expirationTtl: 60 });
  assert.equal(values.has(key), false);
  await kv.put('other', 'data');
  assert.equal(await kv.get('other'), 'data');
});

test('fails closed on coordinator failure and unexpected marker operations', async () => {
  const kv = assertionReplayKv({}, async () => { throw new Error('unavailable'); });
  await assert.rejects(kv.get(key), /unavailable/);
  await assert.rejects(kv.get('client-assertion-jti:unexpected'), /Unexpected/);
  await assert.rejects(kv.get(key, 'json'), /Unexpected/);
  await assert.rejects(kv.put(key, 'other', { expirationTtl: 60 }), /Unexpected/);
});
