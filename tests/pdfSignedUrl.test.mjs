import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPdfProcessingUrl, PDF_SIGNED_URL_TTL_SECONDS } from '../lib/pdfSignedUrl.ts';

test('requests a short-lived signed URL for the uploaded PDF', async () => {
  let call;
  const bucket = { async createSignedUrl(path, expiry) { call = { path, expiry }; return { data: { signedUrl: 'https://example.test/signed?token=synthetic' }, error: null }; } };
  assert.equal(await createPdfProcessingUrl(bucket, 'user/file.pdf'), 'https://example.test/signed?token=synthetic');
  assert.deepEqual(call, { path: 'user/file.pdf', expiry: PDF_SIGNED_URL_TTL_SECONDS });
  assert.equal(PDF_SIGNED_URL_TTL_SECONDS, 900);
});

test('fails without exposing the provider error or URL', async () => {
  const bucket = { async createSignedUrl() { return { data: null, error: new Error('token=secret') }; } };
  await assert.rejects(createPdfProcessingUrl(bucket, 'user/file.pdf'), { message: 'Could not prepare the PDF for processing.' });
});
