import assert from 'node:assert/strict';
import test from 'node:test';
import * as app from '../lib/aiCredits.ts';
import * as server from '../supabase/functions/_shared/aiCredits.ts';

test('the app draws the same allowance the server enforces', () => {
  assert.deepEqual(app.CREDIT_LIMIT, server.CREDIT_LIMIT);
  assert.deepEqual(app.CREDIT_COST, server.CREDIT_COST);
  assert.deepEqual([...app.CREDIT_FEATURES], [...server.CREDIT_FEATURES]);
  const now = new Date('2026-11-18T10:00:00Z');
  assert.equal(app.creditPeriodStart(now), server.creditPeriodStart(now));
  const counts = { ai_chat_create: 4, ai_chat: 6, card_fill: 5, lesson_generate: 3, pdf_process: 1 };
  assert.equal(app.creditsSpent(counts), server.creditsSpent(counts));
  assert.equal(app.creditsSpent({ ai_chat: 1 }), null);
});

test('what is left, when it is worth saying, and when it is back', () => {
  const now = new Date('2026-12-20T10:00:00Z');
  const plenty = app.creditState(12, false, now);
  assert.deepEqual([plenty.limit, plenty.left, plenty.low, plenty.out, plenty.resets], [50, 38, false, false, 'Jan 1']);
  assert.equal(app.creditsLabel(plenty), '38 AI credits left this month');
  const low = app.creditState(40, false, now);
  assert.equal(low.low, true);
  assert.equal(app.creditsLabel(app.creditState(49, false, now)), '1 AI credit left this month');
  const out = app.creditState(80, false, now);
  assert.deepEqual([out.left, out.out], [0, true]);
  assert.equal(app.creditsLabel(out), 'No AI credits left · back Jan 1');
  assert.equal(app.creditState(100, true, now).low, false);
  // Enough for a thing or not; unknown counts as enough, and the server decides.
  assert.equal(app.canAfford(app.creditState(48, false, now), 'lesson_generate'), false);
  assert.equal(app.canAfford(app.creditState(48, false, now), 'card_fill'), true);
  assert.equal(app.canAfford(null, 'pdf_process'), true);
  assert.match(app.creditGuide(plenty), /set of cards uses 3[\s\S]*50 a month, or 2,000 with Pro[\s\S]*own AI/);
});
