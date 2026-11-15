import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { recordIssuedTokens } from '../dist/recordIssuedTokens.js';

const req = new Request('http://localhost/oauth/token', { method: 'POST' });
const data = { access_token: 'alice:grant:access', refresh_token: 'alice:grant:refresh', token_type: 'bearer', expires_in: 300 };
const response = () => Response.json(data);
test('records both token hashes before returning the provider response', async () => {
  const expected = [data.access_token, data.refresh_token].map(token => createHash('sha256').update(token).digest('hex'));
  let recorded = false;
  const result = await recordIssuedTokens(req, response(), grant => ({ registerIssuedTokens: async (owner, records) => {
    assert.equal(grant, 'grant'); assert.equal(owner, 'alice'); assert.deepEqual(records.map(record => record.digest), expected);
    assert.ok(records[0].expires < records[0].retained && records[0].retained < records[1].expires); recorded = true; return true;
  } }));
  assert.equal(recorded, true);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), data);
});
test('withholds tokens if registry is unavailable or provider output is inconsistent', async () => {
  const failure = await recordIssuedTokens(req, response(), () => ({ registerIssuedTokens: async () => false }));
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes('access'));
  const bad = Response.json({ ...data, refresh_token: 'bob:grant:refresh' });
  assert.equal((await recordIssuedTokens(req, bad, () => { throw new Error('should not resolve'); })).status, 503);
});
