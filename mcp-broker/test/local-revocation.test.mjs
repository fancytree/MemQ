import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { localRevocation } from '../dist/localRevocationGuard.js';

const token = 'alice:grant_1:secret';
const digest = createHash('sha256').update(token).digest('hex');
const request = body => new Request('http://127.0.0.1:8787/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
const issued = async (grant, owner, hash, client) => grant === 'grant_1' && owner === 'alice' && hash === digest && client === 'client';
test('valid token revokes its coordinator after provider authentication', async () => {
  const calls = [];
  const response = await localRevocation(request(`token=${token}&client_id=client`),
    async () => { calls.push('provider'); return new Response('', { status: 200 }); },
    async () => { calls.push('coordinator'); return true; }, issued);
  assert.equal(response.status, 200); assert.deepEqual(calls, ['provider', 'coordinator']);
});
test('unknown tokens and wrong clients return success without revoking a grant', async () => {
  let calls = 0;
  const response = await localRevocation(request(`token=${token}&client_id=other`), async () => new Response('', { status: 200 }), async () => { calls++; return true; }, issued);
  assert.equal(response.status, 200); assert.equal(calls, 0);
});
test('bad credentials never reach coordinator revocation', async () => {
  let calls = 0;
  const response = await localRevocation(request(`token=${token}&client_id=client&client_secret=x`), async () => new Response('', { status: 401 }), async () => { calls++; return true; }, issued);
  assert.equal(response.status, 401); assert.equal(calls, 0);
});
test('Basic authentication is passed to provider before coordinator revocation', async () => {
  const req = new Request('http://127.0.0.1:8787/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa('client:secret')}` }, body: `token=${token}` });
  let calls = 0;
  assert.equal((await localRevocation(req, async () => new Response('', { status: 200 }), async () => { calls++; return true; }, issued)).status, 200);
  assert.equal(calls, 1);
});
test('assertion issuer is only used after the provider verifies the client', async () => {
  const assertion = `e30.${Buffer.from(JSON.stringify({ iss: 'client' })).toString('base64url')}.signature`;
  const body = `token=${token}&client_assertion=${assertion}&client_assertion_type=test`;
  let lookups = 0, revocations = 0;
  const lookup = async (...args) => { lookups++; return issued(...args); };
  const revoke = async () => { revocations++; return true; };
  assert.equal((await localRevocation(request(body), async () => new Response('', { status: 401 }), revoke, lookup)).status, 401);
  assert.equal(lookups, 0); assert.equal(revocations, 0);
  assert.equal((await localRevocation(request(body), async () => new Response('', { status: 200 }), revoke, lookup)).status, 200);
  assert.equal(lookups, 1); assert.equal(revocations, 1);
});
test('a failed coordinator can be retried using the issued-token registry', async () => {
  let attempts = 0;
  const provider = async () => new Response('', { status: 200 });
  const revoke = async () => { if (++attempts === 1) throw new Error('offline'); return true; };
  assert.equal((await localRevocation(request(`token=${token}&client_id=client`), provider, revoke, issued)).status, 503);
  assert.equal((await localRevocation(request(`token=${token}&client_id=client`), provider, revoke, issued)).status, 200);
});
test('non-revocation requests are left unread', async () => {
  const req = request('grant_type=refresh_token&refresh_token=abc');
  assert.equal(await localRevocation(req, async () => new Response(), async () => true, issued), null);
  assert.equal(await req.text(), 'grant_type=refresh_token&refresh_token=abc');
});
