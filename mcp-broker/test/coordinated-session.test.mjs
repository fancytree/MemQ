import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatedSession } from '../dist/coordinatedSession.js';
import { sealSession } from '../dist/sessionEnvelope.js';

const key = Buffer.alloc(32, 7).toString('base64url');
const session = { userId: 'alice', accessToken: 'access', refreshToken: 'refresh', expiresAt: 2000 };
test('only uses an active, unexpired session bound to the verified subject and grant', async () => {
  const sealed = await sealSession(key, 'alice', 'grant', session);
  const coordinator = { sessionForRequest: async owner => owner === 'alice' ? sealed : null };
  assert.deepEqual(await coordinatedSession(coordinator, key, 'alice', 'grant', () => 1000), session);
  assert.equal(await coordinatedSession(coordinator, key, 'alice', 'other', () => 1000), null);
  assert.equal(await coordinatedSession(coordinator, key, 'bob', 'grant', () => 1000), null);
  assert.equal(await coordinatedSession(coordinator, key, 'alice', 'grant', () => 2000), null);
});
test('coordinator failures and corrupt sessions fail closed', async () => {
  assert.equal(await coordinatedSession({ sessionForRequest: async () => { throw new Error('offline'); } }, key, 'alice', 'grant'), null);
  assert.equal(await coordinatedSession({ sessionForRequest: async () => 'invalid' }, key, 'alice', 'grant'), null);
});
