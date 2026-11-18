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
});

test('the record of what was used: newest first, each with what it took and when', () => {
  const now = new Date(2026, 10, 18, 15, 0);
  const at = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
  const entries = app.creditHistory([
    { id: 'a', feature: 'ai_chat', created_at: at(18, 9, 5) },
    { id: 'b', feature: 'lesson_generate', created_at: at(18, 14, 30) },
    { id: 'c', feature: 'pdf_process', created_at: at(17, 0, 7) },
    { id: 'd', feature: 'card_fill', created_at: at(3, 23, 59) },
    { id: 'e', feature: 'ai_chat_create', created_at: at(3, 12, 0) },
    // Not paid in credits, or unreadable: neither is on the record.
    { id: 'f', feature: 'grade_answer', created_at: at(18, 10, 0) },
    { id: 'g', feature: 'ai_chat', created_at: 'when?' },
  ], now);
  assert.deepEqual(entries, [
    { id: 'b', name: 'Set of cards', cost: 3, when: 'Today 2:30 PM' },
    { id: 'a', name: 'Chat message', cost: 1, when: 'Today 9:05 AM' },
    { id: 'c', name: 'PDF read', cost: 10, when: 'Yesterday 12:07 AM' },
    { id: 'd', name: 'Card written', cost: 1, when: 'Nov 3 11:59 PM' },
    { id: 'e', name: 'Chat message', cost: 1, when: 'Nov 3 12:00 PM' },
  ]);
  assert.deepEqual(app.creditHistory([], now), []);
  // Every kind of use has a name and a price on the page.
  for (const feature of app.CREDIT_FEATURES) assert.ok(app.CREDIT_NAME[feature], feature);
  assert.deepEqual(app.CREDIT_PRICES.map((price) => price.cost), [1, 1, 3, 10]);
});
