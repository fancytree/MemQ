import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownedPdfPath, signOwnedPdfReference } from '../supabase/functions/_shared/pdfReference.ts';

const origin = 'https://example.supabase.co';
const user = '11111111-1111-1111-1111-111111111111';

test('accepts legacy and signed URLs only for the caller’s PDF path', () => {
  const encoded = `${user}/lesson%20notes.pdf`;
  assert.equal(ownedPdfPath(`${origin}/storage/v1/object/public/pdfs/${encoded}`, origin, user), `${user}/lesson notes.pdf`);
  assert.equal(ownedPdfPath(`${origin}/storage/v1/object/sign/pdfs/${encoded}?token=synthetic`, origin, user), `${user}/lesson notes.pdf`);
});

test('only signs an authenticated owner path and discards the supplied token', async () => {
  const reference = `${origin}/storage/v1/object/sign/pdfs/${user}/notes.pdf?token=untrusted`;
  const getUser = async () => ({ data: { user: { id: user } }, error: null });
  let signedPath;
  const sign = async (path) => { signedPath = path; return { data: { signedUrl: 'https://example.test/fresh-token' }, error: null }; };
  assert.equal(await signOwnedPdfReference(reference, origin, getUser, sign), 'https://example.test/fresh-token');
  assert.equal(signedPath, `${user}/notes.pdf`);
  signedPath = undefined;
  assert.equal(await signOwnedPdfReference(reference, origin, async () => ({ data: { user: { id: 'another-user' } }, error: null }), sign), null);
  assert.equal(await signOwnedPdfReference(reference, origin, async () => ({ data: { user: null }, error: 'unauthorized' }), sign), null);
  assert.equal(signedPath, undefined);
  assert.equal(await signOwnedPdfReference(reference, origin, getUser, async () => ({ data: null, error: 'denied' })), null);
});

test('rejects other owners, external hosts, altered paths and malformed URLs', () => {
  for (const value of [
    `${origin}/storage/v1/object/public/pdfs/other/file.pdf`,
    `https://attacker.example/storage/v1/object/public/pdfs/${user}/file.pdf`,
    `${origin}/storage/v1/object/public/avatars/${user}/file.pdf`,
    `${origin}/storage/v1/object/public/pdfs/${user}%2F..%2Fother%2Ffile.pdf`,
    `${origin}/storage/v1/object/public/pdfs/${user}/bad%00name.pdf`,
    `${origin}/storage/v1/object/public/pdfs/${user}/file.pdf#fragment`,
    'not a url',
  ]) assert.equal(ownedPdfPath(value, origin, user), null, value);
});

test('uses only the configured public origin for local proxy deployments', async () => {
  const internal = 'http://kong:8000';
  const external = 'http://127.0.0.1:56421';
  const reference = `${external}/storage/v1/object/public/pdfs/${user}/notes.pdf`;
  const getUser = async () => ({ data: { user: { id: user } }, error: null });
  const sign = async () => ({ data: { signedUrl: `${internal}/storage/v1/object/sign/pdfs/${user}/notes.pdf?token=fresh` }, error: null });
  assert.equal(ownedPdfPath(reference, internal, user), null);
  assert.equal(await signOwnedPdfReference(reference, internal, getUser, sign, external), `${external}/storage/v1/object/sign/pdfs/${user}/notes.pdf?token=fresh`);
  assert.equal(await signOwnedPdfReference(reference, internal, getUser, sign, 'http://127.0.0.1:56421/invalid'), null);
  assert.equal(await signOwnedPdfReference(reference, internal, getUser, async () => ({ data: { signedUrl: 'https://attacker.example/file?token=fresh' }, error: null }), external), null);
});
