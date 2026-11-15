import test from 'node:test';
import assert from 'node:assert/strict';
import { questionFor, matchQuestion, plannedSteps, askableSteps, cardKind, displayLength, firstSense, LIMITS } from '../lib/practiceRound.ts';
import { DEFAULT_PRACTICE_SETTINGS, normalizePracticeSettings } from '../lib/practiceModes.ts';
import { inferLanguageKind } from '../lib/languageCard.ts';

const word = (id, term, definition, data = {}) => ({ id, lesson_id: 'lang', term, definition, explanation: null, language_data: data });
const fact = (id, term, definition) => ({ id, lesson_id: 'know', term, definition, explanation: null, language_data: null });
const words = [
  word('w1', 'happy', 'feeling pleasure', { synonyms: ['glad', 'cheerful'], antonyms: ['sad'], example: 'She was happy to see him again.' }),
  word('w2', 'quick', 'moving fast'),
  word('w3', 'heavy', 'weighing a lot'),
  word('w4', 'bright', 'giving much light'),
  word('w5', 'quiet', 'making little noise'),
];
const facts = [
  fact('k1', 'Mitochondria', 'Produces energy in the cell'),
  fact('k2', 'Ribosome', 'Builds proteins from amino acids'),
  fact('k3', 'Nucleus', 'Holds the genetic material'),
  fact('k4', 'Lysosome', 'Breaks down waste'),
];
const only = (...on) => Object.fromEntries(Object.keys(DEFAULT_PRACTICE_SETTINGS.modes).map((mode) => [mode, on.includes(mode)]));
const context = (modes, random = () => 0.5) => ({ modes, topicByLesson: { lang: 'English', know: 'Biology' }, pool: [...words, ...facts], random });
/** Every form a step can take for a card, by running the draw across the whole range. */
const variants = (term, step, modes, partners = []) => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    let n = i;
    const result = questionFor(term, step, context(modes, () => { n = (n * 7 + 3) % 200; return n / 200; }), partners);
    if (result) seen.add(result.variant);
  }
  return seen;
};

test('the further along a card is, the fewer and harder its steps', () => {
  assert.deepEqual(plannedSteps(null), ['flip', 'recognize', 'produce']);
  assert.deepEqual(plannedSteps(0), ['flip', 'recognize', 'produce']);
  assert.deepEqual(plannedSteps(2), ['recognize', 'produce']);
  assert.deepEqual(plannedSteps(4), ['produce']);
});

test('a word with synonyms, opposites and an example can be asked every way', () => {
  const seen = variants(words[0], 'recognize', only('mcq', 'listen'));
  for (const variant of ['meaning', 'reverse', 'synonym', 'antonym', 'gap', 'heard']) assert.ok(seen.has(variant), `${variant} missing from ${[...seen]}`);
  const produced = variants(words[0], 'produce', only('recall', 'listen', 'build'));
  for (const variant of ['meaning', 'spelling', 'dictation', 'build']) assert.ok(produced.has(variant), `${variant} missing from ${[...produced]}`);
});

test('a card is only asked what it has the material for', () => {
  const seen = variants(words[1], 'recognize', only('mcq', 'listen'));
  assert.ok(!seen.has('synonym') && !seen.has('antonym') && !seen.has('gap'));
  assert.ok(!variants(words[1], 'produce', only('recall', 'listen', 'build')).has('build'));
});

test('a knowledge card is never heard, spelled as dictation or built', () => {
  assert.deepEqual([...variants(facts[0], 'recognize', DEFAULT_PRACTICE_SETTINGS.modes, facts)].sort(), ['meaning', 'reverse']);
  assert.deepEqual([...variants(facts[0], 'produce', DEFAULT_PRACTICE_SETTINGS.modes)].sort(), ['meaning', 'spelling']);
});

test('reverse choices do not mix scripts when the answer is an acronym', () => {
  const pool = [fact('a', 'AI', 'A field of intelligent machines'), fact('b', '中文选项', 'One definition'), fact('c', 'Biology', 'Another definition'), fact('d', 'Chemistry', 'A third definition'), fact('e', 'Physics', 'A fourth definition')];
  let checked = 0;
  for (let i = 0; i < 100; i++) {
    const result = questionFor(pool[0], 'recognize', { modes: only('mcq'), topicByLesson: {}, pool, random: () => i / 100 });
    if (result?.variant !== 'reverse') continue;
    checked++;
    assert.equal(result.question.opts.includes('中文选项'), false);
    assert.equal(result.question.opts.length, 4);
  }
  assert.ok(checked > 0);
});

test('a synonym question never offers another right answer or the word itself', () => {
  for (let i = 0; i < 50; i++) {
    let n = i;
    const result = questionFor(words[0], 'recognize', context(only('mcq'), () => { n = (n * 13 + 5) % 50; return n / 50; }));
    if (result?.variant !== 'synonym') continue;
    const q = result.question;
    assert.ok(['glad', 'cheerful'].includes(q.opts[q.correct]));
    assert.equal(q.opts.filter((opt) => ['glad', 'cheerful', 'happy'].includes(opt)).length, 1);
    assert.equal(new Set(q.opts).size, 4);
  }
});

test('a gap question blanks the word in its own sentence', () => {
  const builders = questionFor({ ...words[0] }, 'recognize', { ...context(only('mcq')), random: () => 0.74 });
  let gap = null;
  for (let i = 0; i < 100 && !gap; i++) {
    const result = questionFor(words[0], 'recognize', context(only('mcq'), () => i / 100));
    if (result?.variant === 'gap') gap = result.question;
  }
  assert.ok(builders);
  assert.equal(gap.q, 'She was _____ to see him again.');
  assert.equal(gap.opts[gap.correct], 'happy');
  assert.ok(!gap.opts.includes('glad'));
});

test('dictation and spelling are marked by their letters, meanings by their sense', () => {
  const dictation = questionFor(words[1], 'produce', context(only('listen'))).question;
  assert.equal(dictation.variant, 'dictation');
  assert.equal(dictation.audio, true);
  assert.equal(dictation.answer, 'quick');
  assert.equal(dictation.answerKind, 'spelling');
  const meaning = questionFor(facts[0], 'produce', context(only('recall'), () => 0)).question;
  assert.equal(meaning.answerKind, meaning.variant === 'meaning' ? 'meaning' : 'spelling');
});

test('a sentence is built from all of its words, never handed over in order', () => {
  const result = questionFor(words[0], 'produce', context(only('build'), () => 0.999));
  const q = result.question;
  assert.equal(q.mode, 'build');
  assert.deepEqual(q.answer, ['She', 'was', 'happy', 'to', 'see', 'him', 'again']);
  assert.deepEqual([...q.tiles].sort(), [...q.answer].sort());
  assert.notDeepEqual(q.tiles, q.answer);
});

test('a matching board is words and phrases only, filled out from the lesson, each coming round twice', () => {
  const q = matchQuestion(words.slice(0, 2), context(only('match')));
  // Two waiting cards, three more words from the lesson: five cards, ten pairs.
  assert.equal(q.pairs.length, 5);
  assert.deepEqual(q.pairs.map((pair) => pair.scored), [true, true, false, false, false]);
  assert.equal(q.sequence.length, 10);
  for (let index = 0; index < 5; index++) assert.equal(q.sequence.filter((value) => value === index).length, 2);
  // The first pass shows every card once before any comes round again.
  assert.deepEqual([...q.sequence.slice(0, 5)].sort(), [0, 1, 2, 3, 4]);
  assert.ok(q.pairs.every((pair) => pair.termId.startsWith('w')));
});

test('twelve pairs at most, and it is the fillers that come once when there is not room', () => {
  const many = Array.from({ length: 10 }, (_, index) => word(`m${index}`, `word${index}`, `meaning ${index}`));
  const q = matchQuestion(many.slice(0, 3), { ...context(only('match')), pool: many });
  assert.equal(q.pairs.length, 8);
  assert.equal(q.sequence.length, 12);
  for (const index of [0, 1, 2]) assert.equal(q.sequence.filter((value) => value === index).length, 2);
});

test('no board without two waiting cards, four that can be shown, or for anything but vocabulary', () => {
  assert.equal(matchQuestion([words[0]], context(only('match'))), null);
  assert.equal(matchQuestion(words.slice(0, 2), { ...context(only('match')), pool: words.slice(0, 3) }), null);
  // Knowledge cards and grammar patterns are never matched.
  assert.equal(matchQuestion(facts, context(only('match'))), null);
  assert.equal(questionFor(facts[0], 'recognize', context(only('match')), facts), null);
  const grammar = word('g1', 'used to + verb', 'a past habit', { kind: 'grammar' });
  assert.equal(questionFor(grammar, 'recognize', context(only('match')), words), null);
  const board = matchQuestion([words[0], words[1], grammar], { ...context(only('match')), pool: [...words, grammar] });
  assert.ok(board.pairs.every((pair) => pair.termId !== 'g1'));
  // Two cards with the same face would make a pair with two right answers.
  const twin = { ...words[2], id: 'twin', term: 'weighty' };
  const twins = matchQuestion(words.slice(0, 2), { ...context(only('match')), pool: [...words, twin] });
  assert.equal(twins.pairs.filter((pair) => pair.right === words[2].definition).length, 1);
  // Asked as a step: the card and one partner from its own lesson are enough.
  assert.equal(questionFor(words[0], 'recognize', context(only('match')), [words[1]]).variant, 'match');
  assert.equal(questionFor(words[0], 'recognize', context(only('match')), []), null);
  // Cards from another lesson are no partners: the pairs would give themselves away by subject.
  assert.equal(questionFor(words[0], 'recognize', context(only('match')), facts), null);
});

test('a step nothing can ask is dropped, and a card is never left unasked', () => {
  assert.deepEqual(askableSteps(words[1], 0, context(only('flip')), words), ['flip']);
  assert.deepEqual(askableSteps(words[1], 4, context(only('flip')), words), ['flip']);
  assert.deepEqual(askableSteps(words[1], 0, context(only('mcq', 'recall')), words), ['recognize', 'produce']);
  assert.deepEqual(askableSteps(facts[0], 4, context(only('listen', 'build')), facts), []);
});

test('a second go at a card prefers a different form', () => {
  let same = 0;
  for (let i = 0; i < 100; i++) {
    const result = questionFor(words[0], 'recognize', context(only('mcq'), () => i / 100), [], 'meaning');
    if (result.variant === 'meaning') same++;
  }
  assert.ok(same < 10, `asked the same form ${same} times in 100`);
});

test('a card says what it teaches, or it is worked out', () => {
  assert.equal(inferLanguageKind('happy'), 'word');
  assert.equal(inferLanguageKind('give up'), 'phrase');
  assert.equal(inferLanguageKind('〜てもいい'), 'grammar');
  assert.equal(inferLanguageKind('used to', { part_of_speech: 'grammar pattern' }), 'grammar');
  assert.equal(inferLanguageKind('happy', { kind: 'grammar' }), 'grammar');
  assert.equal(cardKind(facts[0]), 'knowledge');
  assert.equal(cardKind(words[0]), 'word');
});

test('settings stored before a kind existed switch it on', () => {
  const settings = normalizePracticeSettings({ modes: { flip: true, mcq: false, recall: true }, grading: 'strict' });
  assert.deepEqual(settings.modes, { flip: true, mcq: false, match: true, recall: true, listen: true, build: true });
  assert.equal(settings.grading, 'strict');
  assert.deepEqual(normalizePracticeSettings({ modes: { flip: false, mcq: false, match: false, recall: false, listen: false, build: false } }).modes, DEFAULT_PRACTICE_SETTINGS.modes);
  assert.deepEqual(normalizePracticeSettings(null), DEFAULT_PRACTICE_SETTINGS);
});

// ── Length limits ───────────────────────────────────────────────
const LONG = 'A long-lived organelle with a double membrane that converts nutrients into the energy the cell runs on';
const longFact = fact('k9', 'Chloroplast', LONG);
const longPool = [...facts, longFact];
const longContext = (modes, random = () => 0.5) => ({ modes, topicByLesson: { know: 'Biology' }, pool: longPool, random });

test('a wide character takes the room of two', () => {
  assert.equal(displayLength('happy'), 5);
  assert.equal(displayLength('勉強する'), 8);
  assert.equal(displayLength('  a b  '), 3);
});

test('nothing a person picks, pairs, arranges or types is over its limit', () => {
  const everything = [...words, ...longPool];
  const context = { modes: DEFAULT_PRACTICE_SETTINGS.modes, topicByLesson: { lang: 'English', know: 'Biology' }, pool: everything };
  for (const term of everything) {
    for (const step of ['recognize', 'produce']) {
      for (let i = 0; i < 60; i++) {
        let n = i;
        const asked = questionFor(term, step, { ...context, random: () => { n = (n * 7 + 3) % 60; return n / 60; } }, everything.filter((other) => other.id !== term.id));
        if (!asked) continue;
        const q = asked.question;
        if (q.mode === 'mcq') q.opts.forEach((opt) => assert.ok(displayLength(opt) <= LIMITS.option, `option too long: ${opt}`));
        if (q.mode === 'match') q.pairs.forEach((pair) => {
          assert.ok(displayLength(pair.left) <= LIMITS.matchTerm, `tile too long: ${pair.left}`);
          assert.ok(displayLength(pair.right) <= LIMITS.matchMeaning, `tile too long: ${pair.right}`);
        });
        if (q.mode === 'build') q.tiles.forEach((tile) => assert.ok(displayLength(tile) <= LIMITS.tile));
        if (q.mode === 'recall') assert.ok(displayLength(q.answer) <= (q.answerKind === 'spelling' ? LIMITS.typed : LIMITS.typedMeaning), `answer too long: ${q.answer}`);
      }
    }
  }
});

test('a card with a long meaning is asked by its term instead', () => {
  assert.deepEqual([...variants(longFact, 'recognize', DEFAULT_PRACTICE_SETTINGS.modes)], ['reverse']);
  assert.deepEqual([...variants(longFact, 'produce', DEFAULT_PRACTICE_SETTINGS.modes)], ['spelling']);
  const asked = questionFor(longFact, 'recognize', longContext(only('mcq')));
  assert.equal(asked.question.q, LONG);
  assert.equal(asked.question.opts[asked.question.correct], 'Chloroplast');
  // A word whose meaning is too long for a tile is never put on a matching board.
  const wordy = word('w9', 'ubiquitous', LONG);
  const board = matchQuestion(words.slice(0, 2), { ...context(only('match')), pool: [...words, wordy] });
  assert.ok(board.pairs.every((pair) => pair.termId !== 'w9'));
});

test('a long meaning is never offered as a wrong answer', () => {
  for (let i = 0; i < 80; i++) {
    const asked = questionFor(facts[0], 'recognize', longContext(only('mcq'), () => i / 80));
    assert.ok(!asked.question.opts.includes(LONG));
  }
});

test('written questions are held to the same limits', () => {
  const saved = (options, correct_answer, question_type = 'mcq') => ({ term_id: 'k1', question_text: 'Which is it?', question_type, options, correct_answer, explanation: null });
  const withSaved = (rows) => ({ ...facts[0], practiceQuestions: rows });
  const modes = only('mcq');
  const justSaved = (term) => { for (let i = 0; i < 100; i++) { const asked = questionFor(term, 'recognize', longContext(modes, () => i / 100)); if (asked?.variant === 'saved') return asked.question; } return null; };
  // A long wrong answer is dropped from the pool; five short ones remain, so it is still asked.
  const trimmed = justSaved(withSaved([saved(['Energy', 'Protein', 'Waste', 'DNA', 'Lipids', LONG], 'Energy')]));
  assert.ok(trimmed && !trimmed.opts.includes(LONG));
  // A long right answer cannot be a choice at all.
  assert.equal(justSaved(withSaved([saved(['Energy', 'Protein', 'Waste', 'DNA', LONG], LONG)])), null);
  // Nor can a pool left with fewer than four.
  assert.equal(justSaved(withSaved([saved(['Energy', 'Protein', 'Waste', LONG + ' 2', LONG], 'Energy')])), null);
  // A fill-in answer longer than a sentence is not asked for.
  const blank = withSaved([saved(null, LONG + ' ' + LONG, 'fill_blank')]);
  assert.ok(![...variants(blank, 'produce', only('recall'))].includes('saved'));
});

test('a matching tile shows one sense of a meaning', () => {
  assert.equal(firstSense('happy; glad; cheerful'), 'happy');
  assert.equal(firstSense('happy, glad'), 'happy');
  assert.equal(firstSense('a large, slow river'), 'a large, slow river');
  assert.equal(firstSense('big, heavy stone'), 'big, heavy stone');
  assert.equal(firstSense('to run, to jog'), 'to run');
  assert.equal(firstSense('高兴的，快乐的；幸福的'), '高兴的');
  assert.equal(firstSense('1. a river bank 2. a place for money'), 'a river bank');
  assert.equal(firstSense('to stop / to quit'), 'to stop');
  assert.equal(firstSense('either/or choice'), 'either/or choice');
  assert.equal(firstSense('  feeling pleasure  '), 'feeling pleasure');
  assert.equal(firstSense(null), '');
  // A card with several senses goes on the board by its first, however long the rest.
  const many = word('s1', 'bright', 'giving much light; clever and quick to learn; cheerful and lively in manner or colour');
  const board = matchQuestion([words[0], many], { ...context(only('match')), pool: [...words.slice(0, 3), many] });
  assert.equal(board.pairs.find((pair) => pair.termId === 's1').right, 'giving much light');
  // Two cards whose first senses are the same cannot share a board.
  const same = word('s2', 'luminous', 'giving much light; glowing');
  const shared = matchQuestion([words[0], many], { ...context(only('match')), pool: [...words.slice(0, 3), many, same] });
  assert.equal(shared.pairs.filter((pair) => pair.right === 'giving much light').length, 1);
});
