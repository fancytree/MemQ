import test from 'node:test';
import assert from 'node:assert/strict';
import { revokeConnection } from '../dist/revokeConnection.js';

test('persists coordinated denial before provider cleanup', async () => {
  const calls = [];
  await revokeConnection('grant', 'alice', async () => { calls.push('provider'); }, async () => { calls.push('coordinator'); return true; });
  assert.deepEqual(calls, ['coordinator', 'provider']);
});
test('does not clean up a foreign grant or report coordinator failure as success', async () => {
  let providerCalls = 0;
  const provider = async () => { providerCalls++; };
  assert.equal(await revokeConnection('grant', 'bob', provider, async () => false), false);
  assert.equal(providerCalls, 0);
  await assert.rejects(revokeConnection('grant', 'alice', provider, async () => { throw new Error('unavailable'); }));
  assert.equal(providerCalls, 0);
});
test('provider cleanup failures surface and can be retried after denial', async () => {
  let denied = false, attempts = 0;
  const coordinator = async () => { denied = true; return true; };
  const provider = async () => { attempts++; if (attempts === 1) throw new Error('unavailable'); };
  await assert.rejects(revokeConnection('grant', 'alice', provider, coordinator));
  assert.equal(denied, true);
  await revokeConnection('grant', 'alice', provider, coordinator);
  assert.equal(attempts, 2);
});
