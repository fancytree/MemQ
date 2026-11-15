import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeUpstream } from '../dist/upstream.js';
const config = { supabaseUrl: 'https://project.example', publicKey: 'public', clientId: 'client', redirectUri: 'https://memq.example/callback' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const tokens = { access_token: 'secret-access', refresh_token: 'secret-refresh', expires_in: 3600 };
test('exchanges PKCE code and verifies user using server-held access token', async () => {
  let calls = 0;
  const session = await exchangeUpstream(config, { code: 'code', verifier: 'verifier' }, async (url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(url.toString(), 'https://project.example/auth/v1/oauth/token');
      assert.equal(init.body.get('code_verifier'), 'verifier');
      assert.equal(init.redirect, 'manual');
      return reply(tokens);
    }
    assert.equal(url.toString(), 'https://project.example/auth/v1/user');
    assert.equal(init.headers.authorization, 'Bearer secret-access');
    return reply({ id: 'user-a' });
  }, () => 1000);
  assert.equal(session.userId, 'user-a');
  assert.equal(session.expiresAt, 3601000);
  assert.equal(calls, 2);
});
test('rotates refresh token and rejects a change of user', async () => {
  let calls = 0;
  await assert.rejects(() => exchangeUpstream(config, { refreshToken: 'old', expectedUserId: 'user-a' }, async (_url, init) => {
    if (++calls === 1) { assert.equal(init.body.get('refresh_token'), 'old'); return reply(tokens); }
    return reply({ id: 'user-b' });
  }), { kind: 'invalid_grant' });
});
test('distinguishes revoked grants from transient and malformed responses', async () => {
  for (const [body, status, kind] of [[{ error: 'invalid_grant' }, 400, 'invalid_grant'], [{ error: 'other' }, 400, 'temporarily_unavailable'], [{}, 200, 'temporarily_unavailable']]) {
    await assert.rejects(() => exchangeUpstream(config, { code: 'x', verifier: 'y' }, async () => reply(body, status)), { kind });
  }
  await assert.rejects(() => exchangeUpstream(config, { code: 'x', verifier: 'y' }, async () => { throw new Error('offline'); }), { kind: 'temporarily_unavailable' });
});
test('rejects non-HTTPS upstream addresses outside local HTTP development', async () => {
  for (const supabaseUrl of ['http://attacker.example', 'ftp://localhost', 'file://localhost']) {
    let called = false;
    await assert.rejects(() => exchangeUpstream({ ...config, supabaseUrl }, { code: 'x', verifier: 'y' }, async () => { called = true; return reply(tokens); }));
    assert.equal(called, false);
  }
});
