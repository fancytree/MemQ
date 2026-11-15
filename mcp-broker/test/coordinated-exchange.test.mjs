import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatedExchange } from '../dist/coordinatedExchange.js';
import { beginRefresh, finishRefresh, abandonRefresh } from '../dist/grantState.js';
import { openSession } from '../dist/sessionEnvelope.js';
import { initializeCoordinatedGrant } from '../dist/coordinatedGrant.js';

const key = Buffer.alloc(32, 22).toString('base64url');
const session = { userId: 'alice', accessToken: 'access', refreshToken: 'refresh-old', expiresAt: 10000 };
function store() {
  let state = null, sealed = null;
  return {
    async initialize(owner, value, client, pending) { if (state) return false; state = { status: pending ? 'pending' : 'active', owner, client, generation: 0 }; sealed = value; return true; },
    async claimAuthorization(owner, client) { if (state?.status !== 'pending' || state.owner !== owner || state.client !== client) return false; state.status = 'active'; return true; },
    async startRefresh(owner, op) { const next = state && beginRefresh(state, owner, op); if (!next) return null; state = next; return sealed; },
    async completeRefresh(owner, op, value) { const next = finishRefresh(state, owner, op); if (!next) return false; state = next; sealed = value; return true; },
    async failRefresh(owner, op) { const next = abandonRefresh(state, owner, op); if (!next) return false; state = next; sealed = null; return true; },
    get sealed() { return sealed; },
  };
}
test('authorization code and refresh store only encrypted credentials in the coordinator', async () => {
  const coordinator = store();
  const resolve = () => coordinator;
  const input = { grantType: 'authorization_code', userId: 'alice', grantId: 'grant_1', clientId: 'client', props: session };
  assert.equal(await initializeCoordinatedGrant(coordinator, key, 'alice', 'grant_1', session, 'client', true), true);
  const first = await coordinatedExchange(input, resolve, key, async () => { throw new Error('unexpected'); });
  assert.deepEqual(first, { newProps: { kind: 'memq-coordinated-grant-v1', owner: 'alice', grant: 'grant_1' } });
  assert.ok(!JSON.stringify(first).includes('refresh-old'));
  assert.equal(await coordinatedExchange(input, resolve, key, async () => session), null);
  const second = await coordinatedExchange({ ...input, grantType: 'refresh_token', props: first.newProps }, resolve, key, async previous => ({ ...previous, refreshToken: 'refresh-new' }));
  assert.deepEqual(second, first);
  assert.equal((await openSession(key, 'alice', 'grant_1', coordinator.sealed)).refreshToken, 'refresh-new');
});
test('rejects mismatched owners, grants, and unsupported exchanges', async () => {
  const coordinator = store();
  const resolve = () => coordinator;
  const input = { grantType: 'authorization_code', userId: 'alice', grantId: 'grant_1', clientId: 'client', props: session };
  assert.equal(await initializeCoordinatedGrant(coordinator, key, 'alice', 'grant_1', session, 'client', true), true);
  const first = await coordinatedExchange(input, resolve, key, async () => session);
  assert.equal(await coordinatedExchange({ ...input, grantType: 'refresh_token', props: { ...first.newProps, owner: 'bob' } }, resolve, key, async () => session), null);
  assert.equal(await coordinatedExchange({ ...input, grantType: 'refresh_token', props: { ...first.newProps, grant: 'other' } }, resolve, key, async () => session), null);
  assert.equal(await coordinatedExchange({ ...input, grantType: 'other' }, resolve, key, async () => session), null);
});
