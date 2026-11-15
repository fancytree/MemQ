import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeCoordinatedGrant } from '../dist/coordinatedGrant.js';
import { openSession } from '../dist/sessionEnvelope.js';

const key = Buffer.alloc(32, 9).toString('base64url');
const session = { userId: 'alice', accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 10000 };
test('initializes a grant with an encrypted, identity-bound session', async () => {
  let stored;
  const coordinator = { initialize: async (owner, sealed) => { assert.equal(owner, 'alice'); stored = sealed; return true; } };
  assert.equal(await initializeCoordinatedGrant(coordinator, key, 'alice', 'grant', session), true);
  assert.ok(!stored.includes('secret'));
  assert.deepEqual(await openSession(key, 'alice', 'grant', stored), session);
  await assert.rejects(openSession(key, 'alice', 'other', stored));
});
test('fails closed on wrong identity, duplicate grant, or storage failure', async () => {
  let calls = 0;
  const coordinator = { initialize: async () => { calls++; return false; } };
  assert.equal(await initializeCoordinatedGrant(coordinator, key, 'bob', 'grant', session), false);
  assert.equal(calls, 0);
  assert.equal(await initializeCoordinatedGrant(coordinator, key, 'alice', 'grant', session), false);
  assert.equal(calls, 1);
  assert.equal(await initializeCoordinatedGrant({ initialize: async () => { throw new Error('unavailable'); } }, key, 'alice', 'grant', session), false);
});
