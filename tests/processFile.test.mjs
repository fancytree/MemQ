import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { signOwnedPdfReference } from '../supabase/functions/_shared/pdfReference.ts';

const owner = '11111111-1111-1111-1111-111111111111';
const base = 'https://synthetic.supabase.co';

function fixture({ authenticated = true, signerError = false, mineruError = false, officialResult = false, resultUrl = 'https://cdn-mineru.openxlab.org.cn/pdf/sample.zip' } = {}) {
  let handler, signedPath, externalCalls = 0, mineruUrl, modelRequest;
  const log = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: owner } : null }, error: authenticated ? null : 'unauthorized' }) },
    storage: { from: () => ({ createSignedUrl: async (path, seconds) => {
      signedPath = { path, seconds };
      return signerError ? { data: null, error: 'denied' } : { data: { signedUrl: 'https://synthetic.example/fresh-secret' }, error: null };
    } }) },
  };
  class FakeOpenAI { chat = { completions: { create: async (request) => { modelRequest = request; return { choices: [{ message: { content: JSON.stringify({ results: [{ term: 'Cell', definition: 'A unit of life' }] }) } }] }; } } }; }
  const network = async (_url, init) => {
    externalCalls++;
    if (externalCalls === 1) {
      mineruUrl = JSON.parse(init.body).url;
      if (mineruError) return new Response('fresh-secret', { status: 500 });
      return Response.json(officialResult ? { code: 0, data: { task_id: 'synthetic-task' } } : { task_id: 'synthetic-task' });
    }
    if (officialResult && externalCalls === 2) return Response.json({ code: 0, data: { state: 'done', full_zip_url: resultUrl } });
    if (officialResult && externalCalls === 3) return new Response(new Uint8Array([80, 75, 3, 4]));
    return Response.json({ status: 'completed', text: 'Synthetic sample content.' });
  };
  const source = readFileSync(new URL('../supabase/functions/process-file/index.ts', import.meta.url), 'utf8').replace(/^import .*?;\s*/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const values = { SUPABASE_URL: base, SUPABASE_ANON_KEY: 'synthetic-key', MINERU_API_TOKEN: 'synthetic-mineru', OPENAI_API_KEY: 'synthetic-openai' };
  runInNewContext(compiled, {
    Deno: { serve: (fn) => { handler = fn; }, env: { get: (name) => values[name] } },
    createClient: () => client, isDirectAppRequest: async () => authenticated,
    signOwnedPdfReference, OpenAI: FakeOpenAI, fetch: network, Response, URL, setTimeout, Uint8Array, TextDecoder,
    unzipSync: (_archive, { filter }) => {
      assert.equal(filter({ name: 'full.md', originalSize: 20 }), true);
      assert.equal(filter({ name: 'other.txt', originalSize: 20 }), false);
      assert.throws(() => filter({ name: 'other/full.md', originalSize: 6 * 1024 * 1024 }));
      return { 'full.md': new TextEncoder().encode('Synthetic markdown content.') };
    },
    console: { log: (...args) => log.push(args.join(' ')), error: (...args) => log.push(args.join(' ')) },
  });
  const call = (reference) => handler(new Request('https://worker.example/process-file', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify({ pdf_url: reference }) }));
  return { call, snapshot: () => ({ signedPath, externalCalls, mineruUrl, modelRequest, log }) };
}

test('processes a legacy owner URL using a newly signed URL', async () => {
  const f = fixture();
  const response = await f.call(`${base}/storage/v1/object/public/pdfs/${owner}/sample.pdf`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].term, 'Cell');
  assert.deepEqual(f.snapshot().signedPath, { path: `${owner}/sample.pdf`, seconds: 900 });
  assert.equal(f.snapshot().mineruUrl, 'https://synthetic.example/fresh-secret');
  assert.match(f.snapshot().modelRequest.messages[0].content, /language of the source material/i);
});

test('handles documented MinerU state and zip response', async () => {
  const f = fixture({ officialResult: true });
  const response = await f.call(`${base}/storage/v1/object/public/pdfs/${owner}/sample.pdf`);
  assert.equal(response.status, 200);
  assert.equal(f.snapshot().externalCalls, 3);
  assert.match(f.snapshot().modelRequest.messages[1].content, /Synthetic markdown content/);
});

test('does not fetch result URLs outside the documented CDN', async () => {
  const f = fixture({ officialResult: true, resultUrl: 'https://attacker.example/sample.zip' });
  const response = await f.call(`${base}/storage/v1/object/public/pdfs/${owner}/sample.pdf`);
  assert.equal(response.status, 500);
  assert.equal(f.snapshot().externalCalls, 2);
});

test('rejects another owner before signing or contacting the processor', async () => {
  const f = fixture();
  const response = await f.call(`${base}/storage/v1/object/public/pdfs/other/sample.pdf`);
  assert.equal(response.status, 400);
  assert.equal(f.snapshot().signedPath, undefined);
  assert.equal(f.snapshot().externalCalls, 0);
});

test('does not expose processor errors that contain signed URLs', async () => {
  const f = fixture({ mineruError: true });
  const response = await f.call(`${base}/storage/v1/object/public/pdfs/${owner}/sample.pdf`);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /fresh-secret/);
  assert.doesNotMatch(f.snapshot().log.join(' '), /fresh-secret/);
});
