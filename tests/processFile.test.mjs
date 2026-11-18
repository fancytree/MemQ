import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ownedPdfPath, signOwnedPdfReference } from '../supabase/functions/_shared/pdfReference.ts';
import { ALLOWANCES, usageOf } from '../supabase/functions/_shared/aiGate.ts';
import { PDF_MAX_BYTES, pageRange, tooLarge } from '../supabase/functions/_shared/pdfLimits.ts';

const owner = '11111111-1111-1111-1111-111111111111';
const base = 'https://synthetic.supabase.co';

function fixture({ authenticated = true, signerError = false, mineruError = false, officialResult = false, resultUrl = 'https://cdn-mineru.openxlab.org.cn/pdf/sample.zip', refusal = null, pro = false, size = 1024, cards = 1 } = {}) {
  let handler, signedPath, externalCalls = 0, mineruUrl, mineruBody, modelRequest;
  // What the gate was asked for, what was filed afterwards, and what was thrown away.
  const asked = [], filed = [], removed = [];
  const log = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: owner } : null }, error: authenticated ? null : 'unauthorized' }) },
    storage: { from: () => ({
      createSignedUrl: async (path, seconds) => {
        signedPath = { path, seconds };
        return signerError ? { data: null, error: 'denied' } : { data: { signedUrl: 'https://synthetic.example/fresh-secret' }, error: null };
      },
      // Storage's own record of the file: where its size is read from.
      list: async (_folder, { search }) => ({ data: [{ name: search, metadata: { size } }], error: null }),
      remove: async (paths) => { removed.push(...paths); return { data: [], error: null }; },
    }) },
  };
  class FakeOpenAI { chat = { completions: { create: async (request) => { modelRequest = request; return { usage: { prompt_tokens: 900, completion_tokens: 60 }, choices: [{ message: { content: JSON.stringify({ results: cards ? [{ term: 'Cell', definition: 'A unit of life' }] : [] }) } }] }; } } }; }
  const network = async (_url, init) => {
    externalCalls++;
    if (externalCalls === 1) {
      mineruBody = JSON.parse(init.body);
      mineruUrl = mineruBody.url;
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
    createClient: () => client,
    /* The door (aiGate.ts), stood in for: its rules have their own tests. What is
     * checked here is that this function goes through it, with the right
     * allowance, before it spends anything — and files the right thing after. */
    openGate: async (_req, allowance) => {
      asked.push(allowance.feature);
      if (!authenticated) return { ok: false, response: Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 }) };
      if (refusal) return { ok: false, response: Response.json(refusal, { status: 429 }) };
      return { ok: true, admission: { gate: { userId: owner, isPro: pro, internal: false } }, supabase: client, service: null, authorization: 'Bearer synthetic' };
    },
    meter: () => {
      let paid = null;
      return {
        add: (model, usage) => { paid = { model, usage }; },
        done: () => filed.push({ counted: true, ...paid }),
        failed: () => { if (paid) filed.push({ counted: false, ...paid }); },
      };
    },
    afterResponse: (work) => { void work; },
    ALLOWANCES, usageOf, ownedPdfPath, PDF_MAX_BYTES, pageRange, tooLarge, Promise, Number,
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
  return { call, snapshot: () => ({ signedPath, externalCalls, mineruUrl, mineruBody, modelRequest, log, asked, filed, removed }) };
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

const mine = `${base}/storage/v1/object/public/pdfs/${owner}/sample.pdf`;

test('goes through the PDF allowance before anything is spent', async () => {
  const refusal = { error: 'You have used your free PDF imports.', code: 'quota', message: 'You have used your free PDF imports.', limit: 3, used: 3, period: 'lifetime' };
  const f = fixture({ refusal });
  const response = await f.call(mine);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'quota');
  assert.deepEqual(f.snapshot().asked, ['pdf_process']);
  // Refused at the door: nothing signed, nothing sent to the processor or the model.
  assert.equal(f.snapshot().signedPath, undefined);
  assert.equal(f.snapshot().externalCalls, 0);
  assert.deepEqual(f.snapshot().filed, []);
});

test('a signed-out caller is turned away at the same door', async () => {
  const f = fixture({ authenticated: false });
  assert.equal((await f.call(mine)).status, 401);
  assert.equal(f.snapshot().externalCalls, 0);
});

test('a file that is too large is refused, removed, and never sent on', async () => {
  const f = fixture({ size: 21 * 1024 * 1024 });
  const response = await f.call(mine);
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(body.code, 'too_large');
  assert.match(body.message, /20 MB/);
  assert.equal(f.snapshot().externalCalls, 0);
  assert.deepEqual(f.snapshot().removed, [`${owner}/sample.pdf`]);
  assert.deepEqual(f.snapshot().filed, []);
});

test('only the first pages are read, and more of them for Pro', async () => {
  const free = fixture();
  await free.call(mine);
  assert.equal(free.snapshot().mineruBody.page_ranges, '1-30');
  const paid = fixture({ pro: true });
  await paid.call(mine);
  assert.equal(paid.snapshot().mineruBody.page_ranges, '1-200');
});

test('an import that worked is one use, with what it cost, and the file is gone', async () => {
  const f = fixture();
  assert.equal((await f.call(mine)).status, 200);
  const { filed, removed } = f.snapshot();
  assert.equal(filed.length, 1);
  assert.equal(filed[0].counted, true);
  assert.deepEqual(filed[0].usage, { prompt: 900, cached: 0, completion: 60 });
  assert.deepEqual(removed, [`${owner}/sample.pdf`]);
});

test('an import that produced no cards is not one of their three', async () => {
  const f = fixture({ cards: 0 });
  assert.equal((await f.call(mine)).status, 200);
  const { filed, removed } = f.snapshot();
  // The model was paid, so the cost is filed; the person is not charged a use.
  assert.equal(filed.length, 1);
  assert.equal(filed[0].counted, false);
  assert.deepEqual(removed, [`${owner}/sample.pdf`]);
});

test('a failed import costs the person nothing and still removes the file', async () => {
  const f = fixture({ mineruError: true });
  assert.equal((await f.call(mine)).status, 500);
  // Nothing was paid to the model, so there is nothing to file at all.
  assert.deepEqual(f.snapshot().filed, []);
  assert.deepEqual(f.snapshot().removed, [`${owner}/sample.pdf`]);
});
