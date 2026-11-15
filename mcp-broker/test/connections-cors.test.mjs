import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { connectionsCors } from '../dist/connectionsCors.js';

test('only the configured secure web app origin receives grant-management CORS', () => {
  const request = (origin) => new Request('https://broker.example/connections', { headers: { Origin: origin } });
  const allowed = connectionsCors(request('https://app.example'), 'https://app.example');
  assert.equal(allowed?.get('Access-Control-Allow-Origin'), 'https://app.example');
  assert.equal(allowed?.get('Vary'), 'Origin');
  assert.equal(connectionsCors(request('https://evil.example'), 'https://app.example'), null);
  assert.equal(connectionsCors(request('https://app.example'), undefined), null);
  assert.equal(connectionsCors(request('http://app.example'), 'http://app.example'), null);
  assert.equal(connectionsCors(request('https://app.example'), 'https://app.example/path'), null);
  assert.ok(connectionsCors(request('http://localhost:8081'), 'http://localhost:8081'));
});
