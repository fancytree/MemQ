import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batches, buildPrompt, checkQuestion, displayLength, IMPORT_LIMITS, parseImport, saveImport, toPayload,
} from '../lib/cardImport.ts';
import { LIMITS, displayLength as practiceLength } from '../lib/practiceRound.ts';

const mcq = (over = {}) => ({
  question_type: 'mcq', question_text: 'Which part of the cell makes ATP?',
  options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Nucleus', 'Lysosome'], correct_answer: 'Mitochondria', ...over,
});
const recall = (over = {}) => ({ question_type: 'fill_blank', question_text: 'What is the powerhouse of the cell?', correct_answer: 'Mitochondria', ...over });
const card = (over = {}) => ({ term: 'Mitochondria', definition: 'Makes ATP.', questions: [mcq(), recall()], ...over });
const reply = (cards, lesson = { name: 'Cells', learning_mode: 'knowledge' }) => JSON.stringify({ lesson, cards });

// ── the rules agree with the two places they come from

test('the screen limits are the ones practice uses', () => {
  assert.equal(IMPORT_LIMITS.optionDisplay, LIMITS.option);
  for (const sample of ['Mitochondria', '线粒体是细胞的能量工厂', 'カタカナ and latin', '']) {
    assert.equal(displayLength(sample), practiceLength(sample));
  }
});

// ── the prompt

test('the prompt carries the whole contract and is its own valid example', () => {
  const prompt = buildPrompt();
  // The three steps, in order: find out, make, hand over.
  const [one, two, three] = ['STEP 1.', 'STEP 2.', 'STEP 3.'].map((step) => prompt.indexOf(step));
  assert.ok(one > 0 && two > one && three > two);
  for (const must of [
    // Finding out: an earlier conversation, material, or a question.
    'If we were already talking before this message', 'notes, a document or a word list', 'ask me what I want to learn',
    'up to three short questions', '"just go"', 'Do not write any cards until you know',
    // Making: both kinds of lesson, and questions on every card.
    '"learning_mode"', '"language_data"', '"mcq"', '"fill_blank"', 'exactly 5 options', 'copied exactly', 'at most 50 characters',
    // Handing over: a code block, or a file.
    'one JSON object in a code block', 'memq-cards.json', 'paste it into MemQ', 'the whole JSON again',
    // In their language, though these instructions are in English.
    'not the language of these instructions',
  ]) {
    assert.ok(prompt.includes(must), `the prompt should say: ${must}`);
  }
  // The example in the prompt has to pass the checks the prompt is asking for.
  const example = /```json\n([\s\S]*?)```/.exec(prompt)[1];
  const read = parseImport(example);
  assert.equal(read.format, 'json');
  assert.equal(read.cards.length, 1);
  assert.deepEqual(read.cards[0].notes, []);
  assert.equal(read.cards[0].questions.length, 2);
  assert.equal(read.lesson.learning_mode, 'knowledge');
});

test('something to start from is written in, and without it the AI is told to ask', () => {
  const started = buildPrompt({ topic: '  The French Revolution, for an exam  ' });
  assert.match(started, /What I have in mind:\nThe French Revolution, for an exam\n/);
  assert.match(started, /If what I have in mind is clear enough to start, start/);
  assert.doesNotMatch(started, /Otherwise, ask me what I want to learn/);
  assert.doesNotMatch(buildPrompt(), /What I have in mind/);
  assert.match(buildPrompt({ topic: '   ' }), /Otherwise, ask me what I want to learn/);
});

test('cards for a lesson that exists are told which kind it is', () => {
  const language = buildPrompt({ lessonMode: 'language' });
  assert.match(language, /going into a language lesson/);
  assert.match(language, /"language_data"/);
  const knowledge = buildPrompt({ lessonMode: 'knowledge' });
  assert.match(knowledge, /not a language lesson/);
  // No language details are offered where they would be refused.
  assert.doesNotMatch(knowledge, /Language cards only/);
  // With no lesson yet, the AI decides.
  assert.match(buildPrompt(), /Decide which kind of lesson this is/);
});

// ── reading

test('a clean reply comes in whole', () => {
  const read = parseImport(reply([card(), card({ term: 'Ribosome', definition: 'Builds proteins.' })]));
  assert.equal(read.format, 'json');
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.cards.map((c) => [c.id, c.term, c.questions.length]), [['c1', 'Mitochondria', 2], ['c2', 'Ribosome', 2]]);
  assert.deepEqual(read.lesson, { name: 'Cells', learning_mode: 'knowledge' });
  assert.equal(read.cards[0].questions[1].options, null);
});

test('what a model wraps around the JSON does not matter', () => {
  const body = reply([card()]);
  const wrapped = [
    `Here are your cards!\n\n\`\`\`json\n${body}\n\`\`\`\n\nLet me know if you want more.`,
    `\`\`\`\n${body}\n\`\`\``,
    `Sure:\n${body}\nHope that helps.`,
    `﻿${body}`,
    // Curly quotes from a phone keyboard, and a trailing comma.
    body.replace(/"/g, (_m, at) => (at % 2 ? '”' : '“')).replace(/\}\]\}$/, '},]}'),
  ];
  for (const text of wrapped) {
    const read = parseImport(text);
    assert.equal(read.cards.length, 1, text.slice(0, 40));
    assert.equal(read.cards[0].questions.length, 2);
  }
});

test('a bare list of cards, or other common key names, is still understood', () => {
  assert.equal(parseImport(JSON.stringify([card()])).cards.length, 1);
  assert.equal(parseImport(JSON.stringify({ terms: [card()] })).cards.length, 1);
  const loose = parseImport(JSON.stringify([{ front: 'Odin', back: 'Chief god', questions: [
    { type: 'multiple choice', question: 'Who is chief?', options: ['Odin', 'Thor', 'Loki', 'Tyr', 'Freyr'], answer: 'Odin' },
    { type: 'recall', question: 'Name the chief god.', answer: 'Odin' },
  ] }]));
  assert.equal(loose.cards[0].term, 'Odin');
  assert.deepEqual(loose.cards[0].questions.map((q) => q.question_type), ['mcq', 'fill_blank']);
});

test('the same term twice is one card, and nameless cards are reported', () => {
  const read = parseImport(reply([card(), card({ term: 'mitochondria' }), { definition: 'No term' }, 'nonsense']));
  assert.equal(read.cards.length, 1);
  assert.equal(read.problems.length, 2);
  assert.match(read.problems[0], /Card 3 has no term/);
});

test('an import is capped, and says so', () => {
  const many = Array.from({ length: 230 }, (_, i) => card({ term: `Term ${i}` }));
  const read = parseImport(reply(many));
  assert.equal(read.cards.length, IMPORT_LIMITS.cards);
  assert.match(read.problems.join(' '), /first 200/);
});

// ── tables and lines, when the model forgot the format or it is a spreadsheet

test('a CSV with headers is read by column name, in any order', () => {
  const csv = 'Definition,Term,Notes\n"The bill, at a café",il conto,"Ask for it, do not wait"\n"A line\nbreak inside",il resto,\n';
  const read = parseImport(csv);
  assert.equal(read.format, 'table');
  assert.deepEqual(read.cards.map((c) => [c.term, c.definition, c.explanation]), [
    ['il conto', 'The bill, at a café', 'Ask for it, do not wait'],
    ['il resto', 'A line\nbreak inside', undefined],
  ]);
  // No questions travel in a table, and that is not a fault of the card.
  assert.ok(read.cards.every((c) => c.questions.length === 0 && c.notes.length === 0));
});

test('tabs from a spreadsheet, with no header, are term then meaning', () => {
  const read = parseImport('Odin\tChief of the gods\nThor\tGod of thunder\nLoki\tTrickster');
  assert.deepEqual(read.cards.map((c) => c.term), ['Odin', 'Thor', 'Loki']);
});

test('a markdown table is read, and language columns become language details', () => {
  const table = '| Word | Meaning | Pronunciation | Example |\n|---|---|---|---|\n| il conto | the bill | il ˈkonto | Il conto, per favore. |\n| grazie | thank you | ˈɡrattsje | Grazie mille! |';
  const read = parseImport(`Here you go:\n\n${table}`);
  assert.equal(read.format, 'table');
  assert.deepEqual(read.cards[0].language_data, { pronunciation: 'il ˈkonto', example: 'Il conto, per favore.' });
});

test('Chinese headers work too', () => {
  const read = parseImport('术语,释义\n线粒体,细胞的能量工厂\n核糖体,合成蛋白质');
  assert.deepEqual(read.cards.map((c) => c.term), ['线粒体', '核糖体']);
});

test('"term - meaning" lines are the last resort, and a sentence with a colon is not a list', () => {
  const read = parseImport('1. **Odin** - Chief of the gods\n2. Thor: God of thunder\n- Loki — Trickster\n• 弗雷：丰饶之神');
  assert.equal(read.format, 'lines');
  assert.deepEqual(read.cards.map((c) => c.term), ['Odin', 'Thor', 'Loki', '弗雷']);
  assert.equal(parseImport('Note: I could not find anything about that topic.').cards.length, 0);
});

test('nothing, and nonsense, are said plainly and never thrown', () => {
  assert.match(parseImport('').problems[0], /nothing here yet/);
  assert.match(parseImport('   \n ').problems[0], /nothing here yet/);
  assert.match(parseImport('I am sorry, I cannot help with that request.').problems[0], /could not be read/);
  assert.match(parseImport('{"cards": []}').problems[0], /No cards/);
  assert.equal(parseImport(undefined).cards.length, 0);
});

// ── a question

test('a multiple-choice question needs five short options in one language, with the answer among them', () => {
  assert.ok('question' in checkQuestion(mcq()));
  assert.match(checkQuestion(mcq({ correct_answer: 'Chloroplast' })).error, /not among its options/);
  assert.match(checkQuestion(mcq({ options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Lysosome'] })).error, /5 short options/);
  // Repeats do not count twice.
  assert.match(checkQuestion(mcq({ options: ['Mitochondria', 'Ribosome', 'ribosome', 'Nucleus', 'Lysosome'] })).error, /5 short options/);
  // An answer in one script among options in another gives the answer away.
  assert.match(checkQuestion(mcq({ options: ['线粒体', 'Ribosome', 'Golgi', 'Nucleus', 'Lysosome'], correct_answer: '线粒体' })).error, /one language/);
  assert.match(checkQuestion(mcq({ question_text: '' })).error, /no text/);
  assert.match(checkQuestion(mcq({ question_text: 'x'.repeat(241) })).error, /240/);
  assert.match(checkQuestion({ question_type: 'essay', question_text: 'q', correct_answer: 'a' }).error, /unknown type/);
  assert.match(checkQuestion(null).error, /shape/);
});

test('the answer is matched as written, case forgiven, and saved as the option says it', () => {
  const checked = checkQuestion(mcq({ correct_answer: 'mitochondria' }));
  assert.equal(checked.question.correct_answer, 'Mitochondria');
  assert.equal(checked.question.options[0], 'Mitochondria');
});

test('an over-long wrong option is dropped; an over-long right one sinks the question', () => {
  const long = 'A very long distractor that goes on and on well past what fits on one line of a phone';
  const six = checkQuestion(mcq({ options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Nucleus', 'Lysosome', long] }));
  assert.equal(six.question.options.length, 5);
  assert.ok(!six.question.options.includes(long));
  // With only five, dropping one leaves too few to choose between.
  assert.match(checkQuestion(mcq({ options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Nucleus', long] })).error, /5 short options/);
  assert.match(checkQuestion(mcq({ options: [long, 'Ribosome', 'Golgi', 'Nucleus', 'Lysosome'], correct_answer: long })).error, /too long to show/);
  // Width is counted as the screen counts it: a CJK character is two.
  const cjk = '这是一个非常非常长的选项它会在手机屏幕上占据好几行的空间所以不可以用';
  assert.ok(cjk.length <= 60 && displayLength(cjk) > 60);
  assert.match(checkQuestion(mcq({ options: [cjk, '甲', '乙', '丙', '丁'], correct_answer: cjk })).error, /too long to show/);
});

test('at most six options are kept, the right one always among them', () => {
  const eight = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'Answer'];
  const checked = checkQuestion(mcq({ options: eight, correct_answer: 'Answer' }));
  assert.equal(checked.question.options.length, 6);
  assert.ok(checked.question.options.includes('Answer'));
});

test('true/false is English only, and normalised to the app’s own labels', () => {
  const ok = checkQuestion({ question_type: 'true_false', question_text: 'Mitochondria make ATP.', correct_answer: 'true', options: ['yes', 'no'] });
  assert.deepEqual([ok.question.correct_answer, ok.question.options], ['True', ['True', 'False']]);
  assert.match(checkQuestion({ question_type: 'true_false', question_text: '线粒体产生能量。', correct_answer: 'True' }).error, /not in English/);
  assert.match(checkQuestion({ question_type: 'true_false', question_text: 'Is it?', correct_answer: 'Maybe' }).error, /something else/);
});

test('a recall question has no options, whatever was sent', () => {
  const checked = checkQuestion(recall({ options: ['a', 'b'] }));
  assert.equal(checked.question.options, null);
});

// ── a card and its questions

test('a card keeps its questions only as a full set', () => {
  const onlyChoice = parseImport(reply([card({ questions: [mcq()] })])).cards[0];
  assert.deepEqual(onlyChoice.questions, []);
  assert.match(onlyChoice.notes.join(' '), /practice questions were left out/);

  const oneBad = parseImport(reply([card({ questions: [mcq({ correct_answer: 'Nope' }), mcq(), recall()] })])).cards[0];
  assert.equal(oneBad.questions.length, 2);
  assert.match(oneBad.notes[0], /not among its options/);
  assert.ok(!oneBad.notes.join(' ').includes('left out'));

  // No questions at all is not a problem with the card.
  const none = parseImport(reply([{ term: 'Odin', definition: 'Chief god' }])).cards[0];
  assert.deepEqual([none.questions, none.notes], [[], []]);
});

// ── saving

test('cards go to the database in groups it will take', () => {
  const two = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, term: `T${i}`, definition: 'd', questions: [mcq(), recall()], notes: [] }));
  assert.deepEqual(batches(two(120)).map((g) => g.length), [50, 50, 20]);
  // Ten questions a card: the hundred-question ceiling is met first.
  const heavy = two(25).map((c) => ({ ...c, questions: Array.from({ length: 10 }, () => recall()) }));
  assert.deepEqual(batches(heavy).map((g) => g.length), [10, 10, 5]);
  assert.deepEqual(batches([]), []);
});

test('language details only travel to a language lesson', () => {
  const c = { id: 'c1', term: 'grazie', definition: 'thanks', language_data: { pronunciation: 'x' }, questions: [], notes: [] };
  assert.deepEqual(toPayload(c, 'language', false).language_data, { pronunciation: 'x' });
  assert.equal('language_data' in toPayload(c, 'knowledge', false), false);
  assert.equal('questions' in toPayload(c, 'knowledge', false), false);
});

function fakeClient({ failAt = Infinity } = {}) {
  const calls = [];
  let n = 0;
  const answer = (name) => (++n >= failAt ? { data: null, error: { message: 'boom' } }
    : { data: name === 'mcp_create_lesson' ? { id: 'L1' } : { id: 'L1', lesson_id: 'L1', cards_created: 1 }, error: null });
  return {
    calls,
    rpc: async (name, args) => { calls.push({ name, args }); return answer(name); },
    from: (table) => ({ insert: async (rows) => { calls.push({ name: `insert:${table}`, rows }); return ++n >= failAt ? { error: { message: 'boom' } } : { error: null }; } }),
  };
}
const ready = (n, withQuestions = true) => parseImport(reply(Array.from({ length: n }, (_, i) => card({ term: `Term ${i}`, ...(withQuestions ? {} : { questions: undefined }) })))).cards;

test('a new lesson is made by the first write, with its cards and questions together', async () => {
  const client = fakeClient();
  const out = await saveImport(client, ready(60), { kind: 'new', name: 'Cells', description: 'About cells', learning_mode: 'knowledge' });
  assert.deepEqual(client.calls.map((c) => c.name), ['mcp_create_lesson_with_practice', 'mcp_add_cards_with_practice']);
  assert.equal(client.calls[0].args.p_name, 'Cells');
  assert.equal(client.calls[0].args.p_cards.length, 50);
  assert.equal(client.calls[0].args.p_cards[0].questions.length, 2);
  assert.equal(client.calls[1].args.p_lesson_id, 'L1');
  assert.deepEqual(out, { lessonId: 'L1', cards: 60, questions: 120 });
});

test('cards without questions are plain rows; a mix uses both paths into one lesson', async () => {
  const client = fakeClient();
  const mixed = [...ready(2), ...ready(3, false).map((c, i) => ({ ...c, id: `p${i}`, term: `Plain ${i}` }))];
  const out = await saveImport(client, mixed, { kind: 'existing', lesson_id: 'L9', learning_mode: 'knowledge' });
  assert.deepEqual(client.calls.map((c) => c.name), ['mcp_add_cards_with_practice', 'insert:terms']);
  assert.equal(client.calls[1].rows.length, 3);
  assert.deepEqual(Object.keys(client.calls[1].rows[0]).sort(), ['definition', 'explanation', 'language_data', 'lesson_id', 'term']);
  assert.equal(client.calls[1].rows[0].lesson_id, 'L9');
  assert.deepEqual(out, { lessonId: 'L9', cards: 5, questions: 4 });

  const plainOnly = fakeClient();
  await saveImport(plainOnly, ready(3, false), { kind: 'new', name: 'Plain', learning_mode: 'knowledge' });
  assert.deepEqual(plainOnly.calls.map((c) => c.name), ['mcp_create_lesson']);
});

test('a failure says what was already saved, so a retry does not double it', async () => {
  await assert.rejects(saveImport(fakeClient({ failAt: 1 }), ready(3), { kind: 'new', name: 'X', learning_mode: 'knowledge' }), /Nothing was lost/);
  await assert.rejects(saveImport(fakeClient({ failAt: 2 }), ready(60), { kind: 'new', name: 'X', learning_mode: 'knowledge' }), /50 cards were saved and the rest were not/);
  await assert.rejects(saveImport(fakeClient(), [], { kind: 'new', name: 'X', learning_mode: 'knowledge' }), /Nothing is ticked/);
});

test('curly quotes inside a string are left alone', () => {
  // What a model writes when it quotes a phrase in a question. Straightening
  // these before parsing broke every reply that contained one.
  const quoted = reply([card({ questions: [mcq(), recall({ question_text: 'How do you say “the bill” in Italian? It’s short.' })] })]);
  const read = parseImport(`\`\`\`json\n${quoted}\n\`\`\``);
  assert.equal(read.format, 'json');
  assert.equal(read.cards[0].questions[1].question_text, 'How do you say “the bill” in Italian? It’s short.');
});

test('a reply that is still asking is said to be one, and is never read as cards', () => {
  // What comes back first, now that the AI is told to ask before it writes.
  const asking = [
    'Sure! What would you like to learn?',
    'Happy to help. A few quick questions:\n1. Level: how much do you already know?\n2. Purpose: is this for an exam or for fun?\n3. Size: how many cards would you like?',
    '好的！你想学什么内容？\n1. 你目前的水平是？\n2. 想要多少张卡片？',
    'I can make cards from our conversation about spaced repetition: the forgetting curve, the Leitner system and active recall. Shall I go ahead?',
  ];
  for (const text of asking) {
    const read = parseImport(text);
    assert.equal(read.cards.length, 0, text.slice(0, 40));
    assert.match(read.problems[0], /asking you something/);
  }
  // Something that is neither cards nor a question keeps the plainer message.
  assert.match(parseImport('I am sorry, I cannot help with that request.').problems[0], /could not be read/);
  // A real list still reads, even with a question in the sentence above it.
  const list = parseImport('Want more after this?\n- Odin: Chief of the gods\n- Thor: God of thunder\n- Loki: Trickster');
  assert.deepEqual(list.cards.map((c) => c.term), ['Odin', 'Thor', 'Loki']);
});

test('a reply pasted into the wrong box is recognised as cards', async () => {
  const { cardReplyCount } = await import('../lib/cardImport.ts');
  const body = reply([card(), card({ term: 'Ribosome', definition: 'Builds proteins.' })]);
  assert.equal(cardReplyCount(body), 2);
  assert.equal(cardReplyCount(`Here you go!\n\`\`\`json\n${body}\n\`\`\`\nCopy this whole reply and paste it into MemQ.`), 2);
  // Through a keyboard with smart punctuation, every quote arrives curly.
  assert.equal(cardReplyCount(body.replace(/"/g, '\u201d')), 2);
  // What that box is actually for is left alone: a topic, a passage, a list.
  for (const typed of ['', 'The French Revolution', 'Odin: Chief of the gods\nThor: God of thunder\nLoki: Trickster',
    'Term,Definition\nOdin,Chief god\nThor,Thunder', 'A long passage about cells. '.repeat(40), '{"cards": []}', '{"term": "x"}']) {
    assert.equal(cardReplyCount(typed), 0, typed.slice(0, 30));
  }
});

test('a pasted reply is listed with what is already on the screen, and nothing twice', async () => {
  const { addPasted, asImported } = await import('../lib/cardImport.ts');
  const reply = parseImport(JSON.stringify({ lesson: { name: 'Tea' }, cards: [
    { term: 'Oolong', definition: 'A partly oxidised tea.', questions: [
      { question_type: 'mcq', question_text: 'Which tea is partly oxidised?', options: ['Oolong', 'Green tea', 'Black tea', 'White tea', 'Matcha'], correct_answer: 'Oolong' },
      { question_type: 'fill_blank', question_text: 'Name the tea between green and black.', correct_answer: 'Oolong' },
    ] },
    { term: 'Matcha', definition: 'Powdered green tea.' },
    { term: ' oolong ', definition: 'The same card again.' },
  ] }));
  const first = addPasted([], reply);
  assert.deepEqual(first.map((card) => card.term), ['Oolong', 'Matcha']);
  assert.equal(first[0].questions.length, 2);
  assert.equal(new Set(first.map((card) => card.id)).size, 2);
  // Pasting it a second time adds nothing, and what is there keeps its place and id.
  assert.deepEqual(addPasted(first, reply), first);

  // One removed, then more pasted: the new card's id is not one still in use.
  const more = parseImport(JSON.stringify({ cards: [{ term: 'Sencha', definition: 'A steamed green tea.' }, { term: 'Oolong', definition: 'Again.' }] }));
  const after = addPasted([first[1]], more);
  assert.deepEqual(after.map((card) => card.term), ['Matcha', 'Sencha', 'Oolong']);
  assert.equal(new Set(after.map((card) => card.id)).size, 3);

  // The rows a create screen saves, as the saving function takes them.
  const rows = asImported([
    { term: 'Oolong', definition: 'A tea.', explanation: null, language_data: null, questions: first[0].questions },
    { term: 'Matcha', definition: 'A powder.', explanation: 'Whisked.', language_data: { example: 'x' } },
  ]);
  assert.equal(rows[0].questions.length, 2);
  assert.equal('explanation' in rows[0], false);
  assert.deepEqual(rows[1].questions, []);
  assert.deepEqual(rows[1].language_data, { example: 'x' });
  assert.notEqual(rows[0].id, rows[1].id);
});

test('the prompt for a lesson that exists says what it holds and asks for what is missing', async () => {
  const { PROMPT_HELD_MAX } = await import('../lib/cardImport.ts');
  const fresh = buildPrompt();
  assert.doesNotMatch(fresh, /already has/);
  const adding = buildPrompt({ lessonMode: 'knowledge', lesson: { name: 'Norse gods', terms: ['Odin', ' Thor ', '', 'Loki'] } });
  assert.match(adding, /a lesson there called "Norse gods"/);
  assert.match(adding, /already has these 3 cards\. Do not make any of them again/);
  assert.match(adding, /Odin; Thor; Loki/);
  assert.match(adding, /ask me what I want to add/);
  assert.match(adding, /"name" is "Norse gods"/);
  // The contract itself does not change.
  assert.match(adding, /exactly 5 options/);
  assert.match(buildPrompt({ lesson: { name: 'Empty', terms: [] } }), /The lesson has no cards yet\./);
  // A long lesson is not pasted whole, and a long term is cut.
  const many = buildPrompt({ lesson: { name: 'Big', terms: Array.from({ length: PROMPT_HELD_MAX + 30 }, (_, i) => `term ${i}`) } });
  assert.match(many, /; and 30 more/);
  assert.doesNotMatch(many, new RegExp(`term ${PROMPT_HELD_MAX + 5}\\b`));
  assert.match(buildPrompt({ lesson: { name: 'L', terms: ['x'.repeat(200)] } }), /x{60}…/);
  // No name is no lesson.
  assert.equal(buildPrompt({ lesson: { name: '  ', terms: ['Odin'] } }), fresh);
});
