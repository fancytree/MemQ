import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedSession } from '../dist/authorizedSession.js';
import { sealSession } from '../dist/sessionEnvelope.js';

const key = Buffer.alloc(32, 12).toString('base64url');
const props = { kind: 'memq-coordinated-grant-v1', owner: 'alice', grant: 'grant_1' };
const session = { userId: 'alice', accessToken: 'access', refreshToken: 'refresh', expiresAt: 2000 };

test('resolves only a verified owner and grant before decrypting', async () => {
  const sealed = await sealSession(key, 'alice', 'grant_1', session);
  let calls = 0;
  const resolve = grant => { calls++; assert.equal(grant, 'grant_1'); return { sessionForRequest: async owner => owner === 'alice' ? sealed : null }; };
  assert.equal(await authorizedSession({ userId: 'bob' }, props, resolve, key, () => 1000), null);
  assert.equal(calls, 0);
  assert.deepEqual(await authorizedSession({ userId: 'alice' }, props, resolve, key, () => 1000), session);
  assert.equal(calls, 1);
});

test('revoked or unavailable coordination never returns a session', async () => {
  assert.equal(await authorizedSession({ userId: 'alice' }, props, () => ({ sessionForRequest: async () => null }), key), null);
  assert.equal(await authorizedSession({ userId: 'alice' }, props, () => { throw new Error('offline'); }, key), null);
  const wrongGrant = await sealSession(key, 'alice', 'other', session);
  assert.equal(await authorizedSession({ userId: 'alice' }, props, () => ({ sessionForRequest: async () => wrongGrant }), key), null);
});
