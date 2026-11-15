import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleReview, fitToDeadline, dueMoment, cardStateFromRow, isDue } from '../lib/scheduler.ts';

const DAY = 86400000;
const now = new Date('2026-11-15T12:00:00Z');
const days = (from, to) => (to.getTime() - from.getTime()) / DAY;
const state = (stepIndex, nextInDays, lastAgoDays, extra = {}) => ({
  stepIndex, ease: 1, lapses: 0,
  nextReviewAt: new Date(now.getTime() + nextInDays * DAY),
  lastReviewedAt: new Date(now.getTime() - lastAgoDays * DAY), ...extra,
});

test('a new card answered right moves one stage and returns in a day', () => {
  const result = scheduleReview({ state: null, isCorrect: true, now });
  assert.equal(result.outcome, 'promoted');
  assert.equal(result.status, 'Learning');
  assert.ok(Math.abs(days(now, result.nextReviewAt) - 1.03) < 0.01);
});

test('three right answers in one sitting move a card once, not three times', () => {
  let row = null;
  let result;
  for (let i = 0; i < 3; i++) {
    const at = new Date(now.getTime() + i * 60000);
    result = scheduleReview({ state: cardStateFromRow(row), isCorrect: true, now: at });
    row = { step_index: result.stepIndex, next_review_at: result.nextReviewAt.toISOString(), last_reviewed_at: at.toISOString(), ease: result.ease, lapses: result.lapses };
  }
  assert.equal(result.stepIndex, 1);
  assert.equal(result.outcome, 'held');
});

test('the waits expand stage by stage', () => {
  const waits = [1, 2, 3, 4].map((step) => {
    const result = scheduleReview({ state: state(step, -0.01, 1), isCorrect: true, now });
    return days(now, result.nextReviewAt);
  });
  assert.deepEqual(waits.map(Math.round), [3, 7, 14, 31]);
});

test('a miss is one stage back and a second look in ten minutes', () => {
  const result = scheduleReview({ state: state(5, 20, 10), isCorrect: false, now });
  assert.equal(result.status, 'Strong');
  assert.equal(result.outcome, 'lapsed');
  assert.equal(result.lapses, 1);
  assert.ok(result.ease < 1);
  assert.equal(result.nextReviewAt.getTime() - now.getTime(), 10 * 60000);
});

test('missing it again in the same sitting does not take a second step', () => {
  const first = scheduleReview({ state: state(4, 5, 9), isCorrect: false, now });
  const later = new Date(now.getTime() + 3 * 60000);
  const again = scheduleReview({
    state: { stepIndex: first.stepIndex, nextReviewAt: first.nextReviewAt, lastReviewedAt: now, ease: first.ease, lapses: first.lapses },
    isCorrect: false, now: later,
  });
  assert.equal(again.outcome, 'relearning');
  assert.equal(again.stepIndex, first.stepIndex);
  assert.equal(again.lapses, first.lapses);
});

test('fumbling a card on the day it is met costs no ease', () => {
  const result = scheduleReview({ state: state(1, 1, 0), isCorrect: false, now });
  assert.equal(result.stepIndex, 0);
  assert.equal(result.ease, 1);
  assert.equal(result.lapses, 0);
});

test('a card that keeps being missed returns sooner', () => {
  const easy = scheduleReview({ state: state(2, -0.01, 3), isCorrect: true, now });
  const hard = scheduleReview({ state: state(2, -0.01, 3, { ease: 0.6 }), isCorrect: true, now });
  assert.ok(days(now, hard.nextReviewAt) < days(now, easy.nextReviewAt) * 0.7);
});

test('a mastered card keeps doubling, up to the ceiling', () => {
  const result = scheduleReview({ state: state(5, -0.01, 30), isCorrect: true, now });
  assert.ok(Math.round(days(now, result.nextReviewAt)) >= 60);
  const capped = scheduleReview({ state: state(5, -0.01, 170), isCorrect: true, now });
  assert.ok(days(now, capped.nextReviewAt) <= 180);
});

test('a deadline shrinks the remaining waits together and keeps them expanding', () => {
  const deadline = new Date(now.getTime() + 10 * DAY);
  let at = now;
  let card = null;
  const waits = [];
  for (let i = 0; i < 5; i++) {
    const result = scheduleReview({ state: card, isCorrect: true, now: at, deadline });
    assert.equal(result.outcome, 'promoted');
    waits.push(days(at, result.nextReviewAt));
    card = { stepIndex: result.stepIndex, nextReviewAt: result.nextReviewAt, lastReviewedAt: at, ease: result.ease, lapses: 0 };
    at = result.nextReviewAt;
  }
  assert.equal(card.stepIndex, 5);
  // Mastered before the day, with every wait longer than the one before it.
  const reached = at.getTime() - waits[4] * DAY;
  assert.ok(reached < deadline.getTime());
  for (let i = 1; i < 4; i++) assert.ok(waits[i] > waits[i - 1], `wait ${i} should exceed wait ${i - 1}: ${waits}`);
});

test('nothing is scheduled past the day without a last look the day before', () => {
  const deadline = new Date(now.getTime() + 20 * DAY);
  const result = scheduleReview({ state: state(5, -0.01, 60), isCorrect: true, now, deadline });
  assert.ok(Math.abs(days(now, result.nextReviewAt) - 19) < 0.01);
  assert.equal(fitToDeadline(30, 5, now, null), 30);
  assert.equal(fitToDeadline(30, 5, now, new Date(now.getTime() - DAY)), 30);
});

test('a deadline never squeezes a wait below four hours', () => {
  const deadline = new Date(now.getTime() + 0.5 * DAY);
  const result = scheduleReview({ state: null, isCorrect: true, now, deadline });
  assert.ok(days(now, result.nextReviewAt) >= 4 / 24 - 1e-9);
});

test('a wait of days ends when the person\'s day starts, not at the hour they answered', () => {
  // 21:00 in UTC+8 on the 15th. Due "tomorrow" means 04:00 local on the 16th.
  const evening = new Date('2026-11-15T13:00:00Z');
  const due = dueMoment(evening, 1, 480);
  assert.equal(due.toISOString(), '2026-11-15T20:00:00.000Z');
  // 01:00 local is still yesterday's study day: due the coming 04:00 would be three hours on,
  // which is fine, but an answer at 03:30 would be due in half an hour, so it waits a day.
  assert.equal(dueMoment(new Date('2026-11-15T19:30:00Z'), 1, 480).toISOString(), '2026-11-16T20:00:00.000Z');
  // Without an offset the wait is counted in hours.
  assert.equal(dueMoment(evening, 1).getTime() - evening.getTime(), DAY);
  // Short waits are never snapped.
  assert.equal(dueMoment(evening, 0.5, 480).getTime() - evening.getTime(), DAY / 2);
});

test('rows from before the migration read as an ordinary card', () => {
  const card = cardStateFromRow({ step_index: 3, next_review_at: '2026-11-20T00:00:00Z', last_reviewed_at: '2026-11-13T00:00:00Z' });
  assert.equal(card.ease, 1);
  assert.equal(card.lapses, 0);
  assert.equal(isDue(card, now), false);
  assert.equal(isDue(null, now), true);
  assert.equal(cardStateFromRow(null), null);
});
