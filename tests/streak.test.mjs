import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityDaysFromProgressUpdates, activityDaysOf, computeBestStreak, computeCurrentStreak, toLocalDateKey,
} from '../lib/streak.ts';

/** A local day key `days` ago. */
const dayKey = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return toLocalDateKey(date);
};

/** What a card's row says after it was last reviewed `days` ago. */
const progressRow = (days) => {
  const at = new Date();
  at.setHours(12, 0, 0, 0);
  at.setDate(at.getDate() - days);
  return { last_reviewed_at: at.toISOString() };
};

test('the same cards studied three days running are three days, not one', () => {
  // What the cards say: every one of them was last seen today, because today
  // overwrote yesterday, which had overwritten the day before.
  const progress = [progressRow(0), progressRow(0), progressRow(0)];
  assert.equal(computeCurrentStreak(activityDaysFromProgressUpdates(progress)), 1);

  // What the answer log says: one row per answer, so all three days are there.
  const log = [dayKey(2), dayKey(1), dayKey(0)];
  assert.equal(computeCurrentStreak(activityDaysOf(log, progress)), 3);
});

test('the log reaches back past the day it began, through the cards', () => {
  // Nothing was logged before yesterday; a card last seen three days ago is the
  // only trace of that day, and it still counts.
  const days = activityDaysOf([dayKey(1), dayKey(0)], [progressRow(2)]);
  assert.equal(computeCurrentStreak(days), 3);
  assert.equal(computeBestStreak(days), 3);
});

test('a day missed ends the streak, and today need not have started yet', () => {
  assert.equal(computeCurrentStreak(activityDaysOf([dayKey(3), dayKey(2)], [])), 0);
  // Yesterday counts while today is still young.
  assert.equal(computeCurrentStreak(activityDaysOf([dayKey(2), dayKey(1)], [])), 2);
});

test('with no log at all, the cards are still read as before', () => {
  assert.equal(computeCurrentStreak(activityDaysOf(null, [progressRow(1), progressRow(0)])), 2);
});
