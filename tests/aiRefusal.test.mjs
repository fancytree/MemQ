import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRefused, refusalFrom } from '../lib/aiRefusal.ts';

test('a refusal is read with its code and its own sentence', () => {
  const refused = refusalFrom({ error: 'x', code: 'quota', message: ' You have used this month’s AI-generated lessons. ', limit: 5, used: 5 });
  assert.ok(refused instanceof AIRefused);
  assert.equal(refused.code, 'quota');
  assert.equal(refused.message, 'You have used this month’s AI-generated lessons.');
  assert.equal(refusalFrom({ code: 'daily_budget', message: 'AI is resting for today.' }).code, 'daily_budget');
  assert.equal(refusalFrom({ code: 'too_large', message: 'That PDF is larger than 20 MB.' }).code, 'too_large');
});

test('anything else is an ordinary failure, not a refusal', () => {
  assert.equal(refusalFrom(null), null);
  assert.equal(refusalFrom('quota'), null);
  assert.equal(refusalFrom({ error: 'Internal server error', message: 'boom' }), null);
  assert.equal(refusalFrom({ code: 'unauthorized' }), null);
  assert.equal(refusalFrom({ code: 'something_new', message: 'from a newer server' }), null);
});

test('a refusal with no sentence still says something', () => {
  assert.equal(refusalFrom({ code: 'quota' }).message, 'That is not available right now.');
  assert.equal(refusalFrom({ code: 'quota', message: '   ' }).message, 'That is not available right now.');
});
