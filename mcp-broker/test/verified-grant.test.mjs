import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedGrant } from '../dist/verifiedGrant.js';

test('requires a verified subject matching the authenticated grant props', () => {
  const props = { kind: 'memq-coordinated-grant-v1', owner: 'alice', grant: 'grant_1' };
  assert.deepEqual(verifiedGrant({ userId: 'alice' }, props), { owner: 'alice', grant: 'grant_1' });
  assert.equal(verifiedGrant({ userId: 'bob' }, props), null);
  assert.equal(verifiedGrant(undefined, props), null);
  assert.equal(verifiedGrant({ userId: 'alice' }, { ...props, grant: '../other' }), null);
  assert.equal(verifiedGrant({ userId: 'alice' }, { ...props, kind: 'other' }), null);
  assert.equal(verifiedGrant({ userId: 'alice' }, null), null);
});
