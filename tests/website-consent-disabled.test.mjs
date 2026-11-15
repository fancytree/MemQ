import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('disabled website consent does not initialize authentication or show login', () => {
  const config = readFileSync(new URL('../preview/memq-website/oauth/consent/config.js', import.meta.url), 'utf8');
  assert.match(config, /export const CONSENT_ENABLED = false;/);
  const source = readFileSync(new URL('../preview/memq-website/oauth/consent/consent.js', import.meta.url), 'utf8')
    .replace(/^import .*?;\s*/, 'const CONSENT_ENABLED = false;');
  const status = { textContent: '', hidden: true };
  const document = { getElementById(id) { assert.equal(id, 'status'); return status; } };
  runInNewContext(source, { document, window: {} });
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /not available/i);
});

test('explicitly enabled test configuration opens sign-in without a session', async () => {
  const source = readFileSync(new URL('../preview/memq-website/oauth/consent/consent.js', import.meta.url), 'utf8')
    .replace(/^import .*?;\s*/, "const CONSENT_ENABLED = true, SUPABASE_URL = 'http://127.0.0.1', SUPABASE_PUBLISHABLE_KEY = 'test';");
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', addEventListener() {} });
    return elements.get(id);
  };
  let clientCount = 0;
  const window = { supabase: { createClient() { clientCount++; return { auth: { getUser: async () => ({ data: { user: null }, error: null }) } }; } } };
  const document = { getElementById: element };
  runInNewContext(source, { document, window, URLSearchParams, location: { search: '?authorization_id=example' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clientCount, 1);
  assert.equal(element('login').hidden, false);
  assert.equal(element('consent').hidden, true);
});
