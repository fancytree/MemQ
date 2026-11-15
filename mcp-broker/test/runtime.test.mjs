import test from 'node:test';
import assert from 'node:assert/strict';
import { localCimdAllowed, localCoordinatorTestAllowed, validSessionEncryptionKey, validateBrokerRuntime } from '../dist/runtime.js';

test('client metadata experiment requires each safety guard', () => {
  assert.equal(localCimdAllowed(true, true, true), true);
  assert.equal(localCimdAllowed(false, true, true), false);
  assert.equal(localCimdAllowed(true, false, true), false);
  assert.equal(localCimdAllowed(true, true, false), false);
});

test('rejects malformed session keys before starting the authorization flow', () => {
  assert.equal(validSessionEncryptionKey(Buffer.alloc(32).toString('base64url')), true);
  for (const value of [undefined, '', 'synthetic-secret', Buffer.alloc(31).toString('base64url'), Buffer.alloc(32).toString('base64'), 'A'.repeat(42) + 'B']) {
    assert.equal(validSessionEncryptionKey(value), false);
  }
});

test('coordinator experiment cannot connect to hosted projects', () => {
  assert.equal(localCoordinatorTestAllowed('http://127.0.0.1:8787', 'http://127.0.0.1:56421', true, true), true);
  assert.equal(localCoordinatorTestAllowed('http://127.0.0.1:8787', 'https://project.supabase.co', true, true), false);
  assert.equal(localCoordinatorTestAllowed('https://broker.example', 'http://127.0.0.1:56421', true, true), false);
  assert.equal(localCoordinatorTestAllowed('http://127.0.0.1:8787', 'http://127.0.0.1:56421', false, true), false);
  assert.equal(localCoordinatorTestAllowed('http://127.0.0.1:8787', 'http://127.0.0.1:56421', true, false), false);
});
const good={BROKER_ENABLED:'true',BROKER_ORIGIN:'https://mcp.example.com',SUPABASE_URL:'https://project.supabase.co',SUPABASE_OAUTH_CLIENT_ID:'client',SUPABASE_ANON_KEY:'public',BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY:'true'};
test('requires an explicitly enabled broker and exact configured origin',()=>{
 assert.equal(validateBrokerRuntime(good,'https://mcp.example.com/mcp'),'https://mcp.example.com');
 for(const [changes,request] of [
  [{BROKER_ENABLED:'false'},'https://mcp.example.com/mcp'],
  [{BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY:undefined},'https://mcp.example.com/mcp'],
  [{SUPABASE_ANON_KEY:'local-unconfigured'},'https://mcp.example.com/mcp'],
  [{},'https://evil.example/mcp'],
  [{BROKER_ORIGIN:'https://user:password@mcp.example.com'},'https://mcp.example.com/mcp'],
  [{BROKER_ORIGIN:'http://mcp.example.com'},'http://mcp.example.com/mcp'],
  [{SUPABASE_URL:'http://127.0.0.1:55421'},'https://mcp.example.com/mcp'],
 ]) assert.equal(validateBrokerRuntime({...good,...changes},request),null);
});
test('allows explicitly enabled localhost only with a localhost upstream',()=>{
 const local={...good,BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY:undefined,BROKER_ORIGIN:'http://127.0.0.1:8787',SUPABASE_URL:'http://127.0.0.1:55421'};
 assert.equal(validateBrokerRuntime(local,'http://127.0.0.1:8787/mcp'),'http://127.0.0.1:8787');
 assert.equal(validateBrokerRuntime(local,'http://localhost:8787/mcp'),null);
});
