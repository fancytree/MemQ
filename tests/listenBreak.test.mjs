import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTEN_BREAK_CHOICES, listenBreakActive, listenBreakEnd, listenBreakLeft,
} from '../lib/listenBreak.ts';

const at = (h, m = 0) => new Date(2026, 10, 16, h, m, 0);
const choice = (label) => LISTEN_BREAK_CHOICES.find((c) => c.label === label);

test('a break of a set length runs from now', () => {
  const now = at(9, 30);
  assert.equal(listenBreakEnd(choice('30 minutes'), now), at(10, 0).getTime());
  assert.equal(listenBreakEnd(choice('1 hour'), now), at(10, 30).getTime());
});

test('"rest of today" is the next midnight, not a span of hours', () => {
  // Morning and late evening both mean "today", which a fixed number of hours
  // would turn into two very different lengths.
  const midnight = new Date(2026, 10, 17, 0, 0, 0).getTime();
  assert.equal(listenBreakEnd(choice('Today'), at(9, 0)), midnight);
  assert.equal(listenBreakEnd(choice('Today'), at(23, 55)), midnight);
});

test('a break that has passed is the same as no break at all', () => {
  const now = at(12, 0);
  assert.equal(listenBreakActive(at(12, 1).getTime(), now), true);
  assert.equal(listenBreakActive(at(11, 59).getTime(), now), false);
  // Its own last moment has gone: it is over, not still running.
  assert.equal(listenBreakActive(now.getTime(), now), false);
  assert.equal(listenBreakActive(null, now), false);
});

test('what is left is said in minutes, then in hours', () => {
  const now = at(12, 0);
  assert.equal(listenBreakLeft(at(12, 30).getTime(), now), '30 min left');
  assert.equal(listenBreakLeft(at(12, 59).getTime(), now), '59 min left');
  assert.equal(listenBreakLeft(at(13, 0).getTime(), now), '1 hour left');
  assert.equal(listenBreakLeft(at(16, 0).getTime(), now), '4 hours left');
  // Nothing to say once it has passed, so a screen shows nothing.
  assert.equal(listenBreakLeft(at(11, 0).getTime(), now), null);
  assert.equal(listenBreakLeft(null, now), null);
});
