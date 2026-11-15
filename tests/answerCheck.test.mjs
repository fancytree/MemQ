import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSpelling, checkMeaning, allowedSlips, acceptedForms } from '../lib/answerCheck.ts';

const wrongBits = (marks) => marks.filter((mark) => !mark.ok).map((mark) => mark.text);

test('spelling: capitals and punctuation never count', () => {
  for (const grading of ['strict', 'relaxed']) {
    assert.equal(checkSpelling('  Necessary. ', 'necessary', grading).result, 'correct');
    assert.equal(checkSpelling('dont', "don't", grading).result === 'correct', false);
    assert.equal(checkSpelling('don’t', "don't", grading).result, 'correct');
  }
});

test('spelling: strict wants every letter, relaxed passes a slip as almost and marks it', () => {
  const strict = checkSpelling('neccessary', 'necessary', 'strict');
  assert.equal(strict.result, 'wrong');
  const relaxed = checkSpelling('neccessary', 'necessary', 'relaxed');
  assert.equal(relaxed.result, 'almost');
  assert.equal(relaxed.slips, 1);
  assert.deepEqual(wrongBits(relaxed.typed), ['c']);
  assert.deepEqual(wrongBits(relaxed.expected), []);
  const missing = checkSpelling('necesary', 'necessary', 'relaxed');
  assert.equal(missing.result, 'almost');
  assert.deepEqual(wrongBits(missing.expected), ['s']);
});

test('spelling: the allowance grows with the word and short words get none', () => {
  assert.equal(allowedSlips('cat'), 0);
  assert.equal(allowedSlips('house'), 1);
  assert.equal(allowedSlips('blue'), 0);
  assert.equal(allowedSlips('necessary'), 1);
  assert.equal(allowedSlips('accommodation'), 2);
  assert.equal(checkSpelling('acomodate', 'accommodate', 'relaxed').result, 'wrong');
  assert.equal(allowedSlips('a rolling stone gathers no moss'), 3);
  assert.equal(allowedSlips('勉強'), 0);
  assert.equal(checkSpelling('cot', 'cat', 'relaxed').result, 'wrong');
  assert.equal(checkSpelling('huose', 'house', 'relaxed').result, 'almost');
  assert.equal(checkSpelling('hoose', 'house', 'relaxed').slips, 1);
  assert.equal(checkSpelling('nessecery', 'necessary', 'relaxed').result, 'wrong');
  assert.equal(checkSpelling('勉弓', '勉強', 'relaxed').result, 'wrong');
});

test('spelling: a missing accent passes relaxed as almost and fails strict', () => {
  const relaxed = checkSpelling('cafe', 'café', 'relaxed');
  assert.equal(relaxed.result, 'almost');
  assert.equal(relaxed.accentsOnly, true);
  assert.deepEqual(wrongBits(relaxed.expected), ['é']);
  assert.equal(checkSpelling('cafe', 'café', 'strict').result, 'wrong');
  assert.equal(checkSpelling('uber', 'über', 'relaxed').result, 'almost');
});

test('spelling: a card may list alternatives and asides', () => {
  assert.deepEqual(acceptedForms('colour / color'), ['colour / color', 'colour', 'color']);
  assert.equal(checkSpelling('color', 'colour / color', 'strict').result, 'correct');
  assert.equal(checkSpelling('der Hund', 'der Hund (die Hunde)', 'strict').result, 'correct');
  assert.equal(checkSpelling('', 'house', 'relaxed').result, 'wrong');
});

test('spelling: the marks rebuild both strings', () => {
  const verdict = checkSpelling('Recieve it', 'receive it', 'relaxed');
  assert.equal(verdict.typed.map((mark) => mark.text).join(''), 'Recieve it');
  assert.equal(verdict.expected.map((mark) => mark.text).join(''), 'receive it');
  assert.equal(verdict.result, 'almost');
  assert.equal(verdict.slips, 1);
});

test('meaning: strict wants the answer itself', () => {
  assert.equal(checkMeaning('To run', 'to run', 'strict').result, 'correct');
  assert.equal(checkMeaning('run', 'to run', 'strict').result, 'correct');
  assert.equal(checkMeaning('happy', 'happy; glad', 'strict').result, 'correct');
  assert.equal(checkMeaning('glad', 'happy, glad', 'strict').result, 'correct');
  assert.equal(checkMeaning('joyful', 'happy; glad', 'strict').result, 'wrong');
  assert.equal(checkMeaning('joyful', 'happy; glad', 'strict').confident, true);
  assert.equal(checkMeaning('the powerhouse of a cell', 'the powerhouse of the cell', 'strict').result, 'wrong');
});

test('meaning: a comma lists answers only when the pieces are plainly alternatives', () => {
  assert.equal(checkMeaning('glad', 'happy, glad', 'strict').result, 'correct');
  assert.equal(checkMeaning('to jog', 'to run, to jog', 'strict').result, 'correct');
  assert.equal(checkMeaning('快乐的', '高兴的，快乐的', 'strict').result, 'correct');
  assert.equal(checkMeaning('a large', 'a large, slow river', 'strict').result, 'wrong');
  assert.equal(checkMeaning('big', 'big, heavy stone', 'strict').result, 'wrong');
});

test('meaning: relaxed takes typos, reordering and extra words', () => {
  assert.equal(checkMeaning('hapy', 'happy', 'relaxed').result, 'correct');
  assert.equal(checkMeaning('energy production in cells', 'produces energy in the cell', 'relaxed').result, 'correct');
  assert.equal(checkMeaning('it means happy basically', 'happy', 'relaxed').result, 'correct');
  assert.equal(checkMeaning('植物利用光能制造养分', '植物利用光能制造养分的过程', 'relaxed').result, 'correct');
});

test('meaning: a fragment of the answer is not the answer', () => {
  assert.equal(checkMeaning('tion', 'the revolution of 1789', 'relaxed').result, 'wrong');
  assert.equal(checkMeaning('cell', 'produces energy in the cell', 'relaxed').result, 'wrong');
});

test('meaning: relaxed says when words alone cannot settle it', () => {
  const verdict = checkMeaning('makes the power a cell runs on', 'produces energy in the cell', 'relaxed');
  assert.equal(verdict.result, 'wrong');
  assert.equal(verdict.confident, false);
  assert.equal(checkMeaning('', 'anything', 'relaxed').confident, true);
});
