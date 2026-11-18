import test from 'node:test';
import assert from 'node:assert/strict';
import { clearThreads, fileTurn, keptRow, loadThread, refile, rowId, rowsToTurns } from '../lib/chatThread.ts';

const drafts = { cards: [{ id: 'd1', term: 'Odin', definition: 'The Allfather' }], target: { kind: 'new', name: 'Norse gods' } };

test('rows come back as the turns that were on screen', () => {
  const turns = rowsToTurns([
    { id: 'm1', role: 'user', content: 'Who is Odin?' },
    { id: 'm2', role: 'assistant', content: 'The chief of the Norse gods.' },
    { id: 'm3', role: 'user', content: 'Make cards from this' },
    { id: 'm4', role: 'assistant', content: 'Making cards.' },
    { id: 'm5', role: 'system', content: 'App note, not said by anyone: 1 draft card was shown.', payload: { component: 'show_card_drafts', props: drafts } },
  ], 't1');

  assert.equal(turns.length, 2);
  assert.equal(turns[0].question, 'Who is Odin?');
  assert.deepEqual(turns[0].parts, [{ kind: 'text', text: 'The chief of the Norse gods.' }]);
  // Prose first, then the interface, as they arrived.
  assert.deepEqual(turns[1].parts, [
    { kind: 'text', text: 'Making cards.' },
    { kind: 'component', id: 'm5', name: 'show_card_drafts', props: drafts },
  ]);
  // Closed, and still part of the same conversation.
  assert.ok(turns.every((turn) => turn.done && !turn.error && !turn.status && turn.threadId === 't1'));
});

test('a turn the app added comes back under what the tap said, with what became of it', () => {
  const turns = rowsToTurns([
    { id: 'm1', role: 'user', content: 'Make cards' },
    { id: 'm2', role: 'system', content: 'note', payload: { component: 'show_card_drafts', props: drafts, state: { handed: true, picked: ['d1'] } } },
    {
      id: 'm3', role: 'system', content: 'note',
      payload: { component: 'show_lesson_target', props: drafts, said: 'Keep 1 card', state: { saved: { lessonId: 'l1', saved: 1 }, name: 'Norse gods' } },
    },
  ], 't1');

  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0].parts[0].state, { handed: true, picked: ['d1'] });
  assert.equal(turns[1].question, 'Keep 1 card');
  assert.deepEqual(turns[1].parts, [{
    kind: 'component', id: 'm3', name: 'show_lesson_target', props: drafts,
    state: { saved: { lessonId: 'l1', saved: 1 }, name: 'Norse gods' }, local: true,
  }]);
});

test('nothing is drawn for what would draw as nothing', () => {
  const turns = rowsToTurns([
    // Cut in half by the limit: an answer with no question above it.
    { id: 'm0', role: 'assistant', content: 'the tail of an older answer' },
    { id: 'm0b', role: 'system', content: 'note', payload: { component: 'start_practice', props: {} } },
    // From before interfaces were kept: a note and nothing to show.
    { id: 'm1', role: 'user', content: 'quiz me' },
    { id: 'm2', role: 'system', content: 'App note, not said by anyone: A button was shown.' },
    // A payload that is not one.
    { id: 'm3', role: 'user', content: 'again' },
    { id: 'm4', role: 'system', content: 'note', payload: { props: {} } },
    { id: 'm5', role: 'system', content: 'note', payload: 'nonsense' },
    // A role this build has never heard of.
    { id: 'm6', role: 'tool', content: '{}' },
    { id: 'm7', role: 'user', content: 'hello' },
    { id: 'm8', role: 'assistant', content: 'Hello.' },
  ], 't1');
  assert.deepEqual(turns.map((turn) => turn.question), ['hello']);
});

test('row ids are uuids, and not the same one twice', () => {
  const ids = new Set(Array.from({ length: 200 }, rowId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a note is filed the way the server files one, and only when there is one', () => {
  const kept = { component: 'show_lesson_target', props: {}, said: 'Keep 1 card' };
  assert.deepEqual(keptRow(kept, 'They kept it.'), { content: 'App note, not said by anyone: They kept it.', payload: kept });
  // No note: what the model is told is left as it was.
  assert.deepEqual(keptRow(kept), { payload: kept });
});

/** A stand-in for the client: every step returns the same builder, which records
 *  what was asked and resolves to the answer queued for its table. */
function fakeStore(answers) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, steps: [] };
      calls.push(call);
      const builder = new Proxy({}, {
        get(_target, name) {
          if (name === 'then') {
            const queue = answers[table] ?? [];
            const answer = queue.length > 1 ? queue.shift() : queue[0];
            return (resolve, reject) => Promise.resolve(answer).then(resolve, reject);
          }
          return (...args) => { call.steps.push([name, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
}

test('the newest thread on the line is the conversation, read back oldest first', async () => {
  const store = fakeStore({
    chat_threads: [{ data: { thread_id: 't9' }, error: null }],
    // Newest first, as asked for.
    chat_messages: [{ data: [
      { id: 'b', role: 'assistant', content: 'Hello.', payload: null },
      { id: 'a', role: 'user', content: 'hello', payload: null },
      { id: 7, role: 'user', content: 'not a row' },
    ], error: null }],
  });
  const found = await loadThread(store, 'u1', 'practice');
  assert.equal(found.threadId, 't9');
  assert.deepEqual(found.turns.map((turn) => [turn.question, turn.parts[0].text]), [['hello', 'Hello.']]);
  // Their own, on this line.
  assert.deepEqual(store.calls[0].steps.slice(0, 3), [['select', 'thread_id'], ['eq', 'user_id', 'u1'], ['eq', 'mode', 'practice']]);
});

test('no thread, or one that cannot be read, opens on nothing', async () => {
  assert.equal(await loadThread(fakeStore({ chat_threads: [{ data: null, error: null }] }), 'u1', 'create'), null);
  assert.equal(await loadThread(fakeStore({ chat_threads: [{ data: null, error: { message: 'down' } }] }), 'u1', 'create'), null);
  assert.equal(await loadThread(fakeStore({
    chat_threads: [{ data: { thread_id: 't1' }, error: null }],
    chat_messages: [{ data: null, error: { message: 'column payload does not exist' } }],
  }), 'u1', 'create'), null);
  assert.equal(await loadThread({ from() { throw new Error('offline'); } }, 'u1', 'create'), null);
});

test('a thread with nothing to draw is still the thread to carry on', async () => {
  const found = await loadThread(fakeStore({
    chat_threads: [{ data: { thread_id: 't1' }, error: null }],
    chat_messages: [{ data: [], error: null }],
  }), 'u1', 'create');
  assert.deepEqual(found, { threadId: 't1', turns: [] });
});

test('clearing removes every thread on the line, and says when it could not', async () => {
  const store = fakeStore({ chat_threads: [{ error: null }] });
  assert.equal(await clearThreads(store, 'u1', 'create'), true);
  assert.deepEqual(store.calls[0].steps, [['delete'], ['eq', 'user_id', 'u1'], ['eq', 'mode', 'create']]);
  assert.equal(await clearThreads(fakeStore({ chat_threads: [{ error: { message: 'no' } }] }), 'u1', 'create'), false);
  assert.equal(await clearThreads({ from() { throw new Error('offline'); } }, 'u1', 'create'), false);
});

test('a turn the app added is filed as a system row, with the tap and the note', async () => {
  const store = fakeStore({ chat_messages: [{ error: null }] });
  const kept = { component: 'show_lesson_target', props: drafts, said: 'Keep 1 card' };
  assert.equal(await fileTurn(store, { id: 'r1', threadId: 't1', userId: 'u1', kept, note: 'They chose one.' }), true);
  assert.deepEqual(store.calls[0].steps, [['insert', {
    id: 'r1', thread_id: 't1', user_id: 'u1', role: 'system',
    content: 'App note, not said by anyone: They chose one.', payload: kept,
  }]]);
});

test('what became of an interface is written to its row, and counts only if a row took it', async () => {
  const kept = { component: 'show_card_drafts', props: drafts, state: { handed: true } };
  const store = fakeStore({ chat_messages: [{ data: [{ id: 'r1' }], error: null }] });
  assert.equal(await refile(store, { id: 'r1', userId: 'u1', kept }), true);
  assert.deepEqual(store.calls[0].steps, [['update', { payload: kept }], ['eq', 'id', 'r1'], ['eq', 'user_id', 'u1'], ['select', 'id']]);
});

test('a row the server has not filed yet is tried once more', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const kept = { component: 'show_card_drafts', props: drafts, state: { handed: true } };
  // Nothing matched the first time; the row is there the second.
  const store = fakeStore({ chat_messages: [{ data: [], error: null }, { data: [{ id: 'r1' }], error: null }] });
  const done = refile(store, { id: 'r1', userId: 'u1', kept });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2500);
  assert.equal(await done, true);
  assert.equal(store.calls.length, 2);
});
