import { env } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

async function read(stub) {
  return runInDurableObject(stub, (_instance, state) => {
    const row = state.storage.sql.exec('SELECT value FROM grant_state WHERE id = 1').one();
    return JSON.parse(row.value);
  });
}

describe('pending authorization alarm', () => {
  it('clears an expired session after object eviction', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    expect(await stub.initialize('alice', 'synthetic-envelope', 'client', true)).toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      const record = JSON.parse(state.storage.sql.exec('SELECT value FROM grant_state WHERE id = 1').one().value);
      record.pendingExpiresAt = Date.now() - 1;
      state.storage.sql.exec('UPDATE grant_state SET value = ? WHERE id = 1', JSON.stringify(record));
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const record = await read(stub);
    expect(record.state.status).toBe('revoked');
    expect(record.sealedSession).toBeNull();
    expect(await stub.claimAuthorization('alice', 'client')).toBe(false);
  });

  it('reschedules an early alarm and does not clear an active session', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    expect(await stub.initialize('alice', 'synthetic-envelope', 'client', true)).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).not.toBeNull();
    expect(await stub.claimAuthorization('alice', 'client')).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const record = await read(stub);
    expect(record.state.status).toBe('active');
    expect(record.sealedSession).toBe('synthetic-envelope');
  });

  it('clears the session if scheduling the alarm fails', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    const result = await runInDurableObject(stub, async (instance, state) => {
      const spy = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('synthetic failure'));
      try { return await instance.initialize('alice', 'synthetic-envelope', 'client', true); }
      finally { spy.mockRestore(); }
    });
    expect(result).toBe(false);
    const record = await read(stub);
    expect(record.state.status).toBe('revoked');
    expect(record.sealedSession).toBeNull();
  });

  it('clears expired active sessions and token hashes after eviction', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    expect(await stub.initialize('alice', 'synthetic-envelope', 'client', true)).toBe(true);
    expect(await stub.claimAuthorization('alice', 'client')).toBe(true);
    const now = Date.now();
    expect(await stub.registerIssuedTokens('alice', [{ kind: 'access', digest: 'a'.repeat(64), expires: now + 30000, retained: now + 60000 }])).toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      const record = JSON.parse(state.storage.sql.exec('SELECT value FROM grant_state WHERE id = 1').one().value);
      record.grantCleanupAt = Date.now() - 1;
      state.storage.sql.exec('UPDATE grant_state SET value = ? WHERE id = 1', JSON.stringify(record));
      state.storage.sql.exec('UPDATE issued_tokens SET expires = ?, retained = ?', Date.now() - 2, Date.now() - 1);
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const record = await read(stub);
    expect(record.state.status).toBe('revoked');
    expect(record.sealedSession).toBeNull();
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec('SELECT count(*) AS n FROM issued_tokens').one().n)).toBe(0);
  });

  it('revokes the session if active-grant cleanup cannot be scheduled', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    expect(await stub.initialize('alice', 'synthetic-envelope', 'client', true)).toBe(true);
    expect(await stub.claimAuthorization('alice', 'client')).toBe(true);
    const result = await runInDurableObject(stub, async (instance, state) => {
      const spy = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('synthetic failure'));
      const now = Date.now();
      try { return await instance.registerIssuedTokens('alice', [{ kind: 'access', digest: 'a'.repeat(64), expires: now + 30000, retained: now + 60000 }]); }
      finally { spy.mockRestore(); }
    });
    expect(result).toBe(false);
    expect((await read(stub)).sealedSession).toBeNull();
    expect((await read(stub)).state.status).toBe('revoked');
  });

  it('atomically clears credentials and token records on explicit disconnect', async () => {
    const stub = env.GRANTS.getByName(crypto.randomUUID());
    expect(await stub.initialize('alice', 'synthetic-envelope', 'client', true)).toBe(true);
    expect(await stub.claimAuthorization('alice', 'client')).toBe(true);
    const now = Date.now();
    expect(await stub.registerIssuedTokens('alice', [{ kind: 'access', digest: 'a'.repeat(64), expires: now + 30000, retained: now + 60000 }])).toBe(true);
    expect(await stub.prepareRevocation('alice', 'b'.repeat(64), 'client')).toBe(true);
    expect(await stub.revoke('alice')).toBe(true);
    const snapshot = await runInDurableObject(stub, (_instance, state) => ({
      record: JSON.parse(state.storage.sql.exec('SELECT value FROM grant_state WHERE id = 1').one().value),
      tokens: state.storage.sql.exec('SELECT count(*) AS n FROM issued_tokens').one().n,
      pending: state.storage.sql.exec('SELECT count(*) AS n FROM pending_revocations').one().n,
    }));
    expect(snapshot.record.state.status).toBe('revoked');
    expect(snapshot.record.sealedSession).toBeNull();
    expect(snapshot.tokens).toBe(0); expect(snapshot.pending).toBe(0);
    expect(await stub.revoke('alice')).toBe(true);
    expect(await stub.initialize('alice', 'another-envelope', 'client', true)).toBe(false);
  });
});
