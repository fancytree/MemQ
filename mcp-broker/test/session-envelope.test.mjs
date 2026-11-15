import test from 'node:test';
import assert from 'node:assert/strict';
import { openSession, sealSession } from '../dist/sessionEnvelope.js';

const key = Buffer.alloc(32, 42).toString('base64url');
const session = { userId: 'alice', accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 123456 };
test('encrypts sessions with independent nonces and authenticates the grant and owner', async () => {
  const first = await sealSession(key, 'alice', 'grant-1', session);
  const second = await sealSession(key, 'alice', 'grant-1', session);
  assert.notEqual(first, second);
  assert.ok(!first.includes('secret'));
  assert.deepEqual(await openSession(key, 'alice', 'grant-1', first), session);
  await assert.rejects(openSession(key, 'bob', 'grant-1', first));
  await assert.rejects(openSession(key, 'alice', 'grant-2', first));
  await assert.rejects(openSession(Buffer.alloc(32, 43).toString('base64url'), 'alice', 'grant-1', first));
});
test('rejects modified, malformed, and wrong-owner data', async () => {
  const envelope = await sealSession(key, 'alice', 'grant-1', session);
  const [version, iv, ciphertext] = envelope.split('.');
  const modified = `${version}.${iv}.${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  await assert.rejects(openSession(key, 'alice', 'grant-1', modified), /Invalid session envelope/);
  await assert.rejects(openSession(key, 'alice', 'grant-1', 'v2.invalid.invalid'));
  await assert.rejects(sealSession(key, 'bob', 'grant-1', session));
  await assert.rejects(sealSession('short', 'alice', 'grant-1', session));
});
test('never writes a session envelope larger than its reader accepts', async () => {
  const large = { ...session, accessToken: 'x'.repeat(48000) };
  const envelope = await sealSession(key, 'alice', 'grant-1', large);
  assert.ok(envelope.length <= 65536);
  assert.deepEqual(await openSession(key, 'alice', 'grant-1', envelope), large);
  await assert.rejects(sealSession(key, 'alice', 'grant-1', { ...session, accessToken: 'x'.repeat(50000) }), /Session too large/);
});
