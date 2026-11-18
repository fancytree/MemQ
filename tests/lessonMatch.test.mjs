import assert from 'node:assert/strict';
import test from 'node:test';
import { matchLessons, notHeld } from '../lib/lessonMatch.ts';

const lesson = (id, name, learning_mode = 'knowledge') => ({ id, name, learning_mode });
const MINE = [
  lesson('1', 'Japanese tea'), lesson('2', 'Norse gods'), lesson('3', 'Tea'), lesson('4', 'Teamwork at the office'),
  lesson('5', '日语 N2 语法', 'language'), lesson('6', 'The French Revolution'), lesson('7', 'Italian for travel', 'language'),
];
const names = (found) => found.map((one) => one.name);

test('nothing typed offers nothing: an empty box is not a question', () => {
  assert.deepEqual(matchLessons(MINE, ''), []);
  assert.deepEqual(matchLessons(MINE, '   '), []);
  assert.deepEqual(matchLessons([], 'tea'), []);
});

test('the nearest name comes first: the same, then starting with, then containing, then a shared word', () => {
  assert.deepEqual(names(matchLessons(MINE, 'tea')), ['Tea', 'Teamwork at the office', 'Japanese tea']);
  // A proposed name that matches no lesson whole still finds the one about the same thing.
  assert.deepEqual(names(matchLessons(MINE, 'Tea basics')), ['Japanese tea', 'Tea', 'Teamwork at the office']);
  assert.deepEqual(names(matchLessons(MINE, 'NORSE  gods ')), ['Norse gods']);
  assert.deepEqual(names(matchLessons(MINE, 'revolution')), ['The French Revolution']);
  assert.deepEqual(names(matchLessons(MINE, '语法')), ['日语 N2 语法']);
  assert.deepEqual(names(matchLessons(MINE, 'N2 语法复习')), ['日语 N2 语法']);
});

test('small words do not match everything, and no match is no offer', () => {
  assert.deepEqual(matchLessons(MINE, 'Art of war'), []);
  assert.deepEqual(matchLessons(MINE, 'Chemistry'), []);
  assert.equal(matchLessons(MINE, "t", 10).length, 5); // only the names with a "t" in them
});

test('only as many as asked for, nearest kept', () => {
  assert.deepEqual(names(matchLessons(MINE, 'tea', 2)), ['Tea', 'Teamwork at the office']);
  assert.deepEqual(names(matchLessons(MINE, ' norse   GODS')), ['Norse gods']);
});

test('cards the lesson already has are left out, and so is a card given twice', () => {
  const cards = [{ term: 'Odin' }, { term: ' thor ' }, { term: 'Freyja' }, { term: 'FREYJA' }];
  assert.deepEqual(notHeld(cards, ['Thor', 'Loki']).map((card) => card.term), ['Odin', 'Freyja']);
  assert.deepEqual(notHeld(cards, []).length, 3);
  assert.deepEqual(notHeld([], ['Odin']), []);
});
