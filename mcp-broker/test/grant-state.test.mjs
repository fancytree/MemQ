import test from 'node:test';
import assert from 'node:assert/strict';
import { abandonRefresh, beginRefresh, finishRefresh, pendingExpired, permitsRequest, requireReconnect, revokeGrant } from '../dist/grantState.js';

const active = () => ({ status: 'active', owner: 'alice', generation: 0 });

test('only one refresh can begin and a stale operation cannot commit', () => {
  const pending = beginRefresh(active(), 'alice', 'op-1');
  assert.equal(permitsRequest(pending, 'alice'), false);
  assert.equal(beginRefresh(pending, 'alice', 'op-2'), null);
  assert.equal(finishRefresh(pending, 'alice', 'op-2'), null);
  assert.deepEqual(finishRefresh(pending, 'alice', 'op-1'), { status: 'active', owner: 'alice', generation: 1 });
});

test('revocation wins over an in-flight refresh and cannot be undone', () => {
  const pending = beginRefresh(active(), 'alice', 'op-1');
  const revoked = revokeGrant(pending, 'alice');
  assert.equal(permitsRequest(revoked, 'alice'), false);
  assert.equal(finishRefresh(revoked, 'alice', 'op-1'), null);
  assert.equal(beginRefresh(revoked, 'alice', 'op-2'), null);
  assert.deepEqual(revokeGrant(revoked, 'alice'), revoked);
});

test('ambiguous refresh failure requires reconnect rather than retry', () => {
  const pending = beginRefresh(active(), 'alice', 'op-1');
  const uncertain = abandonRefresh(pending, 'alice', 'op-1');
  assert.equal(permitsRequest(uncertain, 'alice'), false);
  assert.equal(beginRefresh(uncertain, 'alice', 'op-2'), null);
  assert.equal(finishRefresh(uncertain, 'alice', 'op-1'), null);
});

test('another user cannot inspect, refresh or revoke the grant', () => {
  const state = active();
  assert.equal(permitsRequest(state, 'bob'), false);
  assert.equal(beginRefresh(state, 'bob', 'op'), null);
  assert.equal(revokeGrant(state, 'bob'), null);
});

test('explicit recovery blocks a late refresh and cannot affect another owner', () => {
  const pending = beginRefresh(active(), 'alice', 'interrupted');
  assert.equal(requireReconnect(pending, 'bob'), null);
  const recovered = requireReconnect(pending, 'alice');
  assert.equal(recovered.status, 'reconnect');
  assert.equal(finishRefresh(recovered, 'alice', 'interrupted'), null);
  assert.equal(permitsRequest(recovered, 'alice'), false);
  assert.equal(requireReconnect(active(), 'alice'), null);
});
test('pending authorizations expire at their deadline and missing deadlines fail closed', () => {
  const pending = { status: 'pending', owner: 'alice', generation: 0 };
  assert.equal(pendingExpired(pending, 100, 99), false);
  assert.equal(pendingExpired(pending, 100, 100), true);
  assert.equal(pendingExpired(pending, undefined, 99), true);
  assert.equal(pendingExpired(active(), 100, 101), false);
});
