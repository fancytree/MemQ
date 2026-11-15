import test from 'node:test';
import assert from 'node:assert/strict';
import { dueForecast, recentDays, stageCounts } from '../lib/reviewStats.ts';

const now = new Date(2026, 10, 15, 12, 0, 0);
const at = (days, hours = 0) => new Date(2026, 10, 15 + days, hours, 30).toISOString();

test('overdue cards are due today, and only the next seven days are counted', () => {
  const counts = dueForecast([at(-3), at(0, 9), at(0, 23), at(1, 1), at(6, 22), at(7, 0), null], 7, now);
  assert.deepEqual(counts, [3, 1, 0, 0, 0, 0, 1]);
});

test('cards without progress, or with an unknown stage, count as New', () => {
  const counts = stageCounts(['a', 'b', 'c', 'd'], new Map([['a', 'Mastered'], ['b', 'Good'], ['c', 'weird']]));
  assert.equal(counts.New, 2);
  assert.equal(counts.Good, 1);
  assert.equal(counts.Mastered, 1);
});

test('recent days end today, oldest first, as local keys', () => {
  assert.deepEqual(recentDays(3, now), ['2026-11-13', '2026-11-14', '2026-11-15']);
});

test('days are shaded by cards studied, recorded days first, against the busiest', async () => {
  const { studyLevels, cardsByLastReview } = await import('../lib/reviewStats.ts');
  const last = cardsByLastReview([at(-2, 9), at(-2, 10), at(-1, 9), null]);
  const recorded = new Map([['2026-11-15', { answers: 30, correct: 20, cards: 8 }]]);
  const levels = studyLevels(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'], recorded, last);
  assert.deepEqual([...levels.values()], [0, 1, 1, 4]);
});
