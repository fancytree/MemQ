import test from 'node:test';
import assert from 'node:assert/strict';
import { consentPage } from '../dist/consent.js';
test('escapes attacker-controlled client metadata and describes destructive permissions', () => {
  const html = consentPage({ clientName: '<script>alert(1)</script>', clientDomain: 'x<y', redirectHost: 'example.com', redirectIsLoopback: false, scope: [] }, '" onfocus="alert(1)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('value="" onfocus='));
  assert.match(html, /delete your lessons and cards/);
  assert.match(html, /Deleting a lesson also deletes its cards/);
});
