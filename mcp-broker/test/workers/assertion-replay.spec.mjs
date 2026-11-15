import { env } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { assertionReplayKv } from '../../src/assertionReplayKv.js';

describe('local assertion replay coordinator', () => {
  it('allows one adapter claim and retains it after eviction', async () => {
    const key = `client-assertion-jti:${crypto.randomUUID().replaceAll('-', '').repeat(2)}`;
    const stub = env.REPLAY.getByName(key);
    const kv = assertionReplayKv({}, () => stub.claim());
    const results = await Promise.all(Array.from({ length: 20 }, () => kv.get(key)));
    expect(results.filter((value) => value === null)).toHaveLength(1);
    await evictDurableObject(stub);
    expect(await kv.get(key)).toBe('1');
  });

  it('reschedules early alarms and cleans up expired markers', async () => {
    const stub = env.REPLAY.getByName(crypto.randomUUID());
    expect(await stub.claim()).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).not.toBeNull();
    expect(await stub.claim()).toBe(false);
    await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec('UPDATE marker SET expires = ?', Date.now() - 1));
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.claim()).toBe(true);
  });

  it('fails closed if an alarm cannot be scheduled', async () => {
    const stub = env.REPLAY.getByName(crypto.randomUUID());
    await expect(runInDurableObject(stub, async (instance, state) => {
      const spy = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('synthetic failure'));
      try { return await instance.claim(); } finally { spy.mockRestore(); }
    })).rejects.toThrow();
  });
});
