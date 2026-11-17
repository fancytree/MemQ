import test from 'node:test';
import assert from 'node:assert/strict';
import { planToday, newCardsPerDay, deadlinePace, deadlineLeft, takeForRound, expectedSteps, DEFAULT_NEW_PER_DAY } from '../lib/studyPlan.ts';

const now = new Date(2026, 10, 15, 12, 0, 0);
const iso = (offsetDays) => new Date(now.getTime() + offsetDays * 86400000).toISOString();
const seen = (id, lessonId, step, nextInDays, madeDaysAgo = 5) => ({
  id, lessonId, progress: { step_index: step, next_review_at: iso(nextInDays), last_reviewed_at: iso(-1), created_at: iso(-madeDaysAgo) },
});
const fresh = (id, lessonId) => ({ id, lessonId });

test('due reviews come first, nearest deadline and weakest card leading', () => {
  const lessons = [{ id: 'calm', deadline: null }, { id: 'exam', deadline: iso(3) }];
  const cards = [seen('c1', 'calm', 1, -2), seen('e-strong', 'exam', 4, -1), seen('e-weak', 'exam', 1, -1), seen('later', 'calm', 2, 4), fresh('n1', 'calm')];
  const plan = planToday(lessons, cards, now);
  assert.deepEqual(plan.queue, ['e-weak', 'e-strong', 'c1', 'n1']);
  assert.deepEqual(plan.early, ['later']);
  assert.equal(plan.byLesson.get('exam').dueReviews, 2);
  assert.equal(plan.byLesson.get('exam').daysLeft, 3);
  assert.equal(plan.byLesson.get('calm').daysLeft, null);
});

test('without a deadline new cards are rationed to a steady number a day', () => {
  const cards = Array.from({ length: 30 }, (_, index) => fresh(`n${index}`, 'l'));
  const plan = planToday([{ id: 'l' }], cards, now);
  assert.equal(plan.queue.length, DEFAULT_NEW_PER_DAY);
  assert.equal(plan.extraNew.length, 30 - DEFAULT_NEW_PER_DAY);
  assert.equal(plan.byLesson.get('l').newLeft, 30);
});

test('cards met today count toward today\'s ration', () => {
  const cards = [
    ...Array.from({ length: 4 }, (_, index) => seen(`met${index}`, 'l', 1, 1, 0)),
    ...Array.from({ length: 20 }, (_, index) => fresh(`n${index}`, 'l')),
  ];
  const plan = planToday([{ id: 'l' }], cards, now);
  assert.equal(plan.byLesson.get('l').newToday, DEFAULT_NEW_PER_DAY - 4);
});

test('a deadline spreads new cards over the days there are to learn them in', () => {
  // Ten days out: three are kept for review, leaving seven days for sixty cards.
  assert.equal(newCardsPerDay(60, 0, 10), 9);
  // The share does not climb as today's cards are done.
  assert.equal(newCardsPerDay(51, 9, 10), 9);
  // The night before, everything left is today's.
  assert.equal(newCardsPerDay(12, 0, 0.5), 12);
  const cards = Array.from({ length: 60 }, (_, index) => fresh(`n${index}`, 'exam'));
  const plan = planToday([{ id: 'exam', deadline: iso(10) }], cards, now);
  assert.equal(plan.byLesson.get('exam').newToday, 9);
});

test('a deadline that has passed is no deadline', () => {
  const cards = Array.from({ length: 30 }, (_, index) => fresh(`n${index}`, 'l'));
  const plan = planToday([{ id: 'l', deadline: iso(-2) }], cards, now);
  assert.equal(plan.byLesson.get('l').newToday, DEFAULT_NEW_PER_DAY);
  assert.equal(plan.byLesson.get('l').daysLeft, null);
});

test('a card being relearned is due when its ten minutes are up', () => {
  const relearning = { id: 'r', lessonId: 'l', progress: { step_index: 0, status: 'New', next_review_at: iso(-0.001), last_reviewed_at: iso(-0.01), created_at: iso(-3) } };
  const plan = planToday([{ id: 'l' }], [relearning], now);
  assert.deepEqual(plan.queue, ['r']);
});

test('a round is filled by what its cards will ask, not by a card count', () => {
  assert.deepEqual([0, 1, 2, 3, 5].map(expectedSteps), [3, 2, 2, 1, 1]);
  const news = Array.from({ length: 10 }, (_, index) => ({ id: `n${index}`, step: 0 }));
  assert.equal(takeForRound(news, (item) => item.step).length, 4);
  const mature = Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, step: 4 }));
  assert.equal(takeForRound(mature, (item) => item.step).length, 8);
  assert.equal(takeForRound([{ id: 'only', step: 0 }], (item) => item.step).length, 1);
});

test('a deadline is paced in whole days, by the same ration the plan uses', () => {
  const at = (days) => new Date(now.getTime() + days * 86400000);
  // Whole calendar days from today, counted the way a person counts them.
  assert.equal(deadlinePace(at(0), 10, now).days, 0);
  assert.equal(deadlinePace(at(1), 10, now).days, 1);
  // A deadline already gone asks for no days, not a negative number of them.
  assert.equal(deadlinePace(at(-3), 10, now).days, 0);
  // The pace is newCardsPerDay's, so the sheet promises what the plan will give.
  assert.equal(deadlinePace(at(10), 40, now).perDay, newCardsPerDay(40, 0, 10));
  // Nothing to pace until the lesson has cards in it.
  assert.equal(deadlinePace(at(10), 0, now).perDay, null);
});

test('a deadline reads as the time left before it, counted in calendar days', () => {
  const at = (days) => new Date(now.getTime() + days * 86400000);
  assert.equal(deadlineLeft(at(0), now).text, 'Due today');
  assert.equal(deadlineLeft(at(1), now).text, 'Due tomorrow');
  assert.equal(deadlineLeft(at(9), now).text, '9 days left');
  // Counted from midnight to midnight, so an evening deadline tomorrow morning is
  // still "due tomorrow" and not "due today".
  assert.equal(deadlineLeft(new Date(2026, 10, 16, 1, 0, 0), now).text, 'Due tomorrow');
  // Gone by: named by its date, and flagged so a row can set it a step back.
  assert.deepEqual(deadlineLeft(at(-3), now), { text: 'Ended 12 Nov', past: true });
  assert.equal(deadlineLeft(at(2), now).past, false);
  // No deadline, and nothing that parses as one, both come back as nothing to say.
  assert.equal(deadlineLeft(null, now), null);
  assert.equal(deadlineLeft('', now), null);
  assert.equal(deadlineLeft('not a date', now), null);
  // The stored value is a string; it reads the same as the Date.
  assert.equal(deadlineLeft(at(5).toISOString(), now).text, '5 days left');
});
