import test from 'node:test';
import assert from 'node:assert/strict';
import { heldAfter, stillWorthSending, QUEUE_MAX, QUEUE_DAYS } from '../lib/answerQueue.ts';

const answer = (termId, daysAgo = 0, now = new Date()) => ({
  termId,
  isCorrect: true,
  at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  tzOffsetMinutes: 60,
});

test('an answer that could not be sent is kept, with the moment it was given', () => {
  const now = new Date('2026-11-20T09:00:00Z');
  const held = heldAfter([], answer('a', 0, now), now);
  assert.equal(held.length, 1);
  assert.equal(held[0].termId, 'a');
  assert.equal(held[0].at, now.toISOString());
});

test('the queue holds a long round twice over, and drops the oldest beyond that', () => {
  const now = new Date('2026-11-20T09:00:00Z');
  let held = [];
  for (let i = 0; i < QUEUE_MAX + 10; i++) held = heldAfter(held, answer(`t${i}`, 0, now), now);
  assert.equal(held.length, QUEUE_MAX);
  // What is kept is the recent end of the round, not its beginning.
  assert.equal(held[held.length - 1].termId, `t${QUEUE_MAX + 9}`);
  assert.equal(held[0].termId, `t${10}`);
});

test('an answer nobody could send for a fortnight stops being worth sending', () => {
  const now = new Date('2026-11-20T09:00:00Z');
  assert.equal(stillWorthSending(answer('a', QUEUE_DAYS - 1, now), now), true);
  assert.equal(stillWorthSending(answer('a', QUEUE_DAYS + 1, now), now), false);
  // And it is dropped as the queue is added to, rather than sitting there for ever.
  const held = heldAfter([answer('old', QUEUE_DAYS + 2, now)], answer('new', 0, now), now);
  assert.deepEqual(held.map((item) => item.termId), ['new']);
});

test('a broken timestamp is not kept', () => {
  const now = new Date('2026-11-20T09:00:00Z');
  assert.equal(stillWorthSending({ termId: 'a', isCorrect: true, at: 'not a date', tzOffsetMinutes: 0 }, now), false);
});
