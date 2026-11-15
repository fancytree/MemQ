import test from 'node:test';
import assert from 'node:assert/strict';
import { startBoard, clearPair, missPair, isPair, isDone, rowsFor } from '../lib/matchBoard.ts';

const pairsOn = (column) => column.filter(Boolean).map((tile) => tile.pair).sort((a, b) => a - b);
/** Make any pair that is on the board; returns the board after it. */
const makeOne = (board, random) => {
  const left = board.left.find(Boolean);
  const right = board.right.find((tile) => tile && tile.pair === left.pair);
  return clearPair(board, left.id, right.id, random);
};
const seeded = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

test('the board opens with different cards in every row, the same ones on both sides', () => {
  const board = startBoard([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5], 5, seeded(1));
  assert.deepEqual(pairsOn(board.left), [0, 1, 2, 3, 4]);
  assert.deepEqual(pairsOn(board.right), [0, 1, 2, 3, 4]);
  assert.equal(board.queue.length, 7);
  assert.equal(board.total, 12);
});

test('a card is never on the board twice at once', () => {
  // The queue leads with repeats of what is showing; they must wait their turn.
  let board = startBoard([0, 1, 2, 3, 0, 1, 2, 3, 4, 5], 4, seeded(2));
  const random = seeded(3);
  for (let step = 0; step < 40 && !isDone(board); step++) {
    const showing = board.left.filter(Boolean).map((tile) => tile.pair);
    assert.equal(new Set(showing).size, showing.length, `duplicate on the board: ${showing}`);
    assert.deepEqual(pairsOn(board.left), pairsOn(board.right));
    board = makeOne(board, random);
  }
  assert.ok(isDone(board));
  assert.equal(board.made, 10);
});

test('a made pair is replaced at once, in the rows it left', () => {
  let board = startBoard([0, 1, 2, 3, 4, 5, 6, 7], 4, seeded(4));
  const left = board.left.findIndex((tile) => tile.pair === 2);
  const right = board.right.findIndex((tile) => tile.pair === 2);
  board = clearPair(board, board.left[left].id, board.right[right].id, seeded(5));
  // The board is full again, and the newcomer sits where the made pair was.
  assert.equal(board.left.filter(Boolean).length, 4);
  assert.equal(board.left[left].pair, 4);
  assert.equal(board.right[right].pair, 4);
  assert.equal(board.queue.length, 3);
  assert.equal(board.made, 1);
});

test('a row stays empty only while everything waiting is already showing', () => {
  // Rows of 4, but the queue holds only second comings of what is on the board.
  let board = startBoard([0, 1, 2, 3, 1, 2], 4, seeded(11));
  const zero = [board.left.find((tile) => tile.pair === 0), board.right.find((tile) => tile.pair === 0)];
  board = clearPair(board, zero[0].id, zero[1].id, seeded(12));
  assert.equal(board.left.filter(Boolean).length, 3);
  assert.deepEqual(board.queue, [1, 2]);
  // Once the first 1 has gone its second coming can arrive; 2 is still showing, so it still waits.
  const one = [board.left.find((tile) => tile?.pair === 1), board.right.find((tile) => tile?.pair === 1)];
  board = clearPair(board, one[0].id, one[1].id, seeded(13));
  assert.deepEqual(pairsOn(board.left), [1, 2, 3]);
  assert.notEqual(board.left.find((tile) => tile?.pair === 1).id, one[0].id);
  assert.deepEqual(board.queue, [2]);
});

test('the last pairs still arrive when nothing else is left on the board', () => {
  let board = startBoard([0, 1, 2, 3, 4], 4, seeded(7));
  const random = seeded(8);
  for (let i = 0; i < 4; i++) board = makeOne(board, random);
  assert.equal(pairsOn(board.left).length, 1);
  assert.equal(board.queue.length, 0);
  assert.equal(isDone(board), false);
  board = makeOne(board, random);
  assert.ok(isDone(board));
  assert.equal(board.made, 5);
});

test('a wrong match sends both cards round once more, and only once', () => {
  let board = startBoard([0, 1, 2, 3], 4, seeded(9));
  const left = board.left.find((tile) => tile.pair === 0);
  const right = board.right.find((tile) => tile.pair === 1);
  assert.equal(isPair(board, left.id, right.id), false);
  // A wrong pair is not cleared.
  assert.equal(clearPair(board, left.id, right.id), board);
  board = missPair(board, left.id, right.id);
  assert.deepEqual(board.queue, [0, 1]);
  assert.equal(board.total, 6);
  board = missPair(board, left.id, right.id);
  assert.deepEqual(board.queue, [0, 1]);
  assert.equal(board.total, 6);
  const random = seeded(10);
  for (let step = 0; step < 20 && !isDone(board); step++) board = makeOne(board, random);
  assert.ok(isDone(board));
  assert.equal(board.made, 6);
});

test('four to six rows, as many as fit unclipped, never more than there are cards', () => {
  const rows = (height, cards = 8) => rowsFor(height, cards, 74, 8);
  assert.equal(rows(300), 4);
  assert.equal(rows(74 * 5 + 8 * 4), 5);
  assert.equal(rows(74 * 5 + 8 * 4 - 1), 4);
  assert.equal(rows(2000), 6);
  assert.equal(rows(2000, 5), 5);
});
