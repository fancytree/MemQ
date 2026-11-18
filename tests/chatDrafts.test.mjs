import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSelection, readCardDrafts, saveDrafts } from '../lib/chatDrafts.ts';

const lessonId = 'fcb0cc9d-94a1-4d66-a748-830fc44fbaee';
const card = (id, term = 'ciao', definition = 'hello') => ({ id, term, definition });

function writer({ lessonFails = false, cardsFail = false } = {}) {
  const writes = [];
  return {
    writes,
    client: {
      from(table) {
        return {
          insert(rows) {
            writes.push({ table, rows });
            if (table === 'lessons') {
              return {
                select: () => ({
                  single: async () => (lessonFails
                    ? { data: null, error: { message: 'lessons blocked' } }
                    : { data: { id: lessonId }, error: null }),
                }),
              };
            }
            return Promise.resolve(cardsFail ? { error: { message: 'terms blocked' } } : { error: null });
          },
        };
      },
    },
  };
}

test('reads a draft and keeps only cards it can draw', () => {
  const drafts = readCardDrafts({
    cards: [
      card('d1'),
      card('d2', 'il conto', 'the bill'),
      { id: 'd3', term: '  ', definition: 'blank term' },
      { id: 'd4', definition: 'no term' },
      { term: 'no id', definition: 'x' },
      card('d1', 'duplicate id', 'should be dropped'),
    ],
    target: { kind: 'new', name: 'Italian ordering', learning_mode: 'language' },
  });
  assert.equal(drafts.cards.length, 2);
  assert.deepEqual(drafts.cards.map((c) => c.id), ['d1', 'd2']);
  assert.equal(drafts.cards[0].explanation, null, 'a missing explanation should be null, not undefined');
});

test('a draft with nothing drawable is not a draft', () => {
  for (const bad of [null, undefined, 'drafts', 42, {}, { cards: [] }, { cards: [card('d1')] }]) {
    assert.equal(readCardDrafts(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
  // A target that is neither kind, or is missing what it needs.
  assert.equal(readCardDrafts({ cards: [card('d1')], target: { kind: 'elsewhere' } }), null);
  assert.equal(readCardDrafts({ cards: [card('d1')], target: { kind: 'existing', lesson_id: lessonId } }), null);
  assert.equal(readCardDrafts({ cards: [card('d1')], target: { kind: 'new', name: '  ' } }), null);
});

test('an existing target keeps its reason, a new one defaults to knowledge', () => {
  const existing = readCardDrafts({
    cards: [card('d1')],
    target: { kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian basics', why: 'These extend it.' },
  });
  assert.deepEqual(existing.target, {
    kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian basics',
    // The model did not say which mode it is, so the details stay off.
    learning_mode: undefined, why: 'These extend it.',
  });

  const made = readCardDrafts({ cards: [card('d1')], target: { kind: 'new', name: 'Biology', learning_mode: 'nonsense' } });
  assert.equal(made.target.learning_mode, 'knowledge', 'an unknown mode must not become language');
});

test('everything starts ticked unless the draft says otherwise', () => {
  const all = readCardDrafts({ cards: [card('d1'), card('d2')], target: { kind: 'new', name: 'x', learning_mode: 'knowledge' } });
  assert.deepEqual(initialSelection(all), ['d1', 'd2']);

  const some = readCardDrafts({
    cards: [card('d1'), card('d2'), card('d3')],
    target: { kind: 'new', name: 'x', learning_mode: 'knowledge' },
    preselected: ['d2', 'nope'],
  });
  assert.deepEqual(some.preselected, ['d2'], 'an id that is not in the draft should be dropped');
  assert.deepEqual(initialSelection(some), ['d2']);
});

test('a new lesson is created, then its cards', async () => {
  const fake = writer();
  const result = await saveDrafts(fake.client, 'user-a', [card('d1'), card('d2', 'grazie', 'thank you')], {
    kind: 'new', name: 'Italian ordering', description: '  ', learning_mode: 'language',
  });
  assert.deepEqual(result, { lessonId, saved: 2 });
  assert.deepEqual(fake.writes.map((w) => w.table), ['lessons', 'terms']);
  assert.equal(fake.writes[0].rows.user_id, 'user-a');
  assert.equal(fake.writes[0].rows.learning_mode, 'language');
  assert.equal(fake.writes[0].rows.description, null, 'a blank description should be null');
  assert.equal(fake.writes[1].rows.length, 2);
  assert.equal(fake.writes[1].rows[0].lesson_id, lessonId);
});

test('an existing lesson is written to directly, with no lesson insert', async () => {
  const fake = writer();
  const result = await saveDrafts(fake.client, 'user-a', [card('d1')], {
    kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian basics',
  });
  assert.deepEqual(result, { lessonId, saved: 1 });
  assert.deepEqual(fake.writes.map((w) => w.table), ['terms'], 'it must not make a second lesson');
});

test('only the ticked cards are written', async () => {
  const fake = writer();
  await saveDrafts(fake.client, 'user-a', [card('d2', 'grazie', 'thank you')], {
    kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian basics',
  });
  assert.equal(fake.writes[0].rows.length, 1);
  assert.equal(fake.writes[0].rows[0].term, 'grazie');
});

test('nothing ticked is refused before any write', async () => {
  const fake = writer();
  await assert.rejects(
    () => saveDrafts(fake.client, 'user-a', [], { kind: 'existing', lesson_id: lessonId, lesson_name: 'x' }),
    /nothing to keep/i,
  );
  assert.equal(fake.writes.length, 0);
});

test('a refused write is reported, and the cards are not attempted', async () => {
  const fake = writer({ lessonFails: true });
  await assert.rejects(
    () => saveDrafts(fake.client, 'user-a', [card('d1')], { kind: 'new', name: 'x', learning_mode: 'knowledge' }),
    /lessons blocked/,
  );
  assert.deepEqual(fake.writes.map((w) => w.table), ['lessons'], 'cards must not be written without a lesson');

  const cardsBlocked = writer({ cardsFail: true });
  await assert.rejects(
    () => saveDrafts(cardsBlocked.client, 'user-a', [card('d1')], { kind: 'existing', lesson_id: lessonId, lesson_name: 'x' }),
    /terms blocked/,
  );
});

test('language details reach a language lesson and nowhere else', async () => {
  const details = { language_code: 'it-IT', pronunciation: 'eel KON-toh', example: 'Il conto, per favore.' };
  const withDetails = { ...card('d1', 'il conto', 'the bill'), language_data: details };

  const made = writer();
  await saveDrafts(made.client, 'user-a', [withDetails], { kind: 'new', name: 'Italian', learning_mode: 'language' });
  assert.deepEqual(made.writes[1].rows[0].language_data, details);

  // A knowledge lesson must not carry them, even if a card has them.
  const knowledge = writer();
  await saveDrafts(knowledge.client, 'user-a', [withDetails], { kind: 'new', name: 'Biology', learning_mode: 'knowledge' });
  assert.equal(knowledge.writes[1].rows[0].language_data, null);

  // An existing lesson the model said is a language one.
  const existing = writer();
  await saveDrafts(existing.client, 'user-a', [withDetails], {
    kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian basics', learning_mode: 'language',
  });
  assert.deepEqual(existing.writes[0].rows[0].language_data, details);

  // And one where it did not say: lose the detail rather than put it somewhere wrong.
  const unsure = writer();
  await saveDrafts(unsure.client, 'user-a', [withDetails], {
    kind: 'existing', lesson_id: lessonId, lesson_name: 'Something',
  });
  assert.equal(unsure.writes[0].rows[0].language_data, null);
});

test('details are read off the wire, and an unknown mode stays unknown', () => {
  const drafts = readCardDrafts({
    cards: [
      { ...card('d1'), language_data: { pronunciation: 'CHAO', example: 'Ciao!' } },
      { ...card('d2'), language_data: 'not an object' },
      { ...card('d3'), language_data: ['also', 'wrong'] },
    ],
    target: { kind: 'existing', lesson_id: lessonId, lesson_name: 'Italian', learning_mode: 'nonsense' },
  });
  assert.equal(drafts.cards[0].language_data.pronunciation, 'CHAO');
  assert.equal(drafts.cards[1].language_data, null, 'a string is not details');
  assert.equal(drafts.cards[2].language_data, null, 'an array is not details');
  assert.equal(drafts.target.learning_mode, undefined, 'an unknown mode must not become language');
});
