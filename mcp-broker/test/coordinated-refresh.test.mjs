import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatedRefresh } from '../dist/coordinatedRefresh.js';
import { openSession, sealSession } from '../dist/sessionEnvelope.js';
import { beginRefresh, finishRefresh, abandonRefresh, revokeGrant } from '../dist/grantState.js';

const key = Buffer.alloc(32, 31).toString('base64url');
const session = { userId: 'alice', accessToken: 'access', refreshToken: 'old', expiresAt: 123456 };
async function coordinator() {
  let state = { status: 'active', owner: 'alice', generation: 0 };
  let sealed = await sealSession(key, 'alice', 'grant', session);
  return {
    async startRefresh(owner, op) { const next = beginRefresh(state, owner, op); if (!next) return null; state = next; return sealed; },
    async completeRefresh(owner, op, nextSealed) { const next = finishRefresh(state, owner, op); if (!next) return false; state = next; sealed = nextSealed; return true; },
    async failRefresh(owner, op) { const next = abandonRefresh(state, owner, op); if (!next) return false; state = next; sealed = null; return true; },
    revoke() { state = revokeGrant(state, 'alice'); sealed = null; },
    get state() { return state; }, get sealed() { return sealed; },
  };
}
test('one refresh rotates the encrypted credential despite competing attempts', async () => {
  const store = await coordinator();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const exchange = async previous => { calls++; await wait; return { ...previous, refreshToken: 'new' }; };
  const first = coordinatedRefresh(store, key, 'alice', 'grant', exchange);
  const second = coordinatedRefresh(store, key, 'alice', 'grant', exchange);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(calls, 1);
  assert.equal((await openSession(key, 'alice', 'grant', store.sealed)).refreshToken, 'new');
});
test('revocation during exchange prevents a late credential from being stored', async () => {
  const store = await coordinator();
  let unblock, entered;
  const wait = new Promise(resolve => { unblock = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const refresh = coordinatedRefresh(store, key, 'alice', 'grant', async previous => { entered(); await wait; return { ...previous, refreshToken: 'new' }; });
  await started;
  store.revoke();
  unblock();
  assert.equal(await refresh, false);
  assert.equal(store.state.status, 'revoked');
  assert.equal(store.sealed, null);
});
test('an ambiguous upstream failure clears the credential and requires reconnect', async () => {
  const store = await coordinator();
  assert.equal(await coordinatedRefresh(store, key, 'alice', 'grant', async () => { throw new Error('timeout'); }), false);
  assert.equal(store.state.status, 'reconnect');
  assert.equal(store.sealed, null);
});

test('a lost commit response does not restore the old refresh credential', async () => {
  const store = await coordinator();
  const commit = store.completeRefresh;
  store.completeRefresh = async (...args) => {
    assert.equal(await commit(...args), true);
    throw new Error('response lost after commit');
  };
  assert.equal(await coordinatedRefresh(store, key, 'alice', 'grant', async previous => ({ ...previous, refreshToken: 'new' })), false);
  assert.equal(store.state.status, 'active');
  assert.equal((await openSession(key, 'alice', 'grant', store.sealed)).refreshToken, 'new');
  // Provider-level token issuance and retry behavior remain separate concerns.
});
