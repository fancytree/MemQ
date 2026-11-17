import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventParser } from '../lib/chatEvents.ts';
import { applyEvent, applyEvents, endWithoutDone, isEmpty, proseOf, startTurn } from '../lib/chatTurn.ts';

const frame = (event) => `data: ${JSON.stringify(event)}\n\n`;

test('parser: several events in one chunk, and one event across two', () => {
  const parse = createEventParser();
  const body = frame({ type: 'status', status: 'reading' }) + frame({ type: 'text', delta: 'Ciao' });
  assert.deepEqual(parse(body), [
    { type: 'status', status: 'reading' },
    { type: 'text', delta: 'Ciao' },
  ]);

  // Split in the middle of the JSON: nothing until the blank line arrives.
  const whole = frame({ type: 'text', delta: ' and more' });
  const cut = Math.floor(whole.length / 2);
  assert.deepEqual(parse(whole.slice(0, cut)), []);
  assert.deepEqual(parse(whole.slice(cut)), [{ type: 'text', delta: ' and more' }]);
});

test('parser: prose keeps its own newlines without breaking the framing', () => {
  const parse = createEventParser();
  const delta = 'line one\n\nline two';
  assert.deepEqual(parse(frame({ type: 'text', delta })), [{ type: 'text', delta }]);
});

test('parser: comments, blank data and junk are not events', () => {
  const parse = createEventParser();
  assert.deepEqual(parse(': keep-alive\n\n'), []);
  assert.deepEqual(parse('data:\n\n'), []);
  assert.deepEqual(parse('data: not json\n\n'), []);
  assert.deepEqual(parse('retry: 1000\n\n'), []);
  // A malformed event must not stop the next good one.
  assert.deepEqual(parse('data: {oops\n\n' + frame({ type: 'done', thread_id: 't1' })), [{ type: 'done', thread_id: 't1' }]);
});

test('parser: an event this version does not know is dropped, not drawn', () => {
  const parse = createEventParser();
  assert.deepEqual(parse(frame({ type: 'telemetry', value: 3 })), []);
  assert.deepEqual(parse(frame({ type: 'status', status: 'dancing' })), []);
  assert.deepEqual(parse(frame({ type: 'text' })), []);
  // Tolerates CRLF and a missing space after the colon.
  assert.deepEqual(parse('data:{"type":"text","delta":"x"}\r\n\r\n'), [{ type: 'text', delta: 'x' }]);
});

test('turn: tokens join one part instead of becoming many', () => {
  let turn = startTurn('hi');
  turn = applyEvents(turn, [
    { type: 'text', delta: 'I’ll check ' },
    { type: 'text', delta: 'your lessons' },
    { type: 'text', delta: '.' },
  ]);
  assert.equal(turn.parts.length, 1);
  assert.deepEqual(turn.parts[0], { kind: 'text', text: 'I’ll check your lessons.' });
  assert.equal(proseOf(turn), 'I’ll check your lessons.');
});

test('turn: a component closes the prose before it, and later prose starts fresh', () => {
  let turn = startTurn('make me cards');
  turn = applyEvents(turn, [
    { type: 'text', delta: 'Here they are.' },
    { type: 'component', name: 'show_card_drafts', props: { cards: [] } },
    { type: 'text', delta: 'Tick what you want.' },
  ]);
  assert.deepEqual(turn.parts.map((p) => p.kind), ['text', 'component', 'text']);
  assert.equal(turn.parts[0].text, 'Here they are.');
  assert.equal(turn.parts[2].text, 'Tick what you want.');
  assert.equal(proseOf(turn), 'Here they are.Tick what you want.');
});

test('turn: status shows while waiting and clears the moment anything is said', () => {
  let turn = startTurn('hi');
  assert.equal(turn.status, null);
  assert.ok(isEmpty(turn));
  turn = applyEvent(turn, { type: 'status', status: 'thinking' });
  assert.equal(turn.status, 'thinking');
  turn = applyEvent(turn, { type: 'status', status: 'drafting' });
  assert.equal(turn.status, 'drafting', 'a later status replaces the earlier one');
  turn = applyEvent(turn, { type: 'text', delta: 'ok' });
  assert.equal(turn.status, null, 'prose means there is nothing to say about waiting');
  assert.equal(isEmpty(turn), false);

  // A component also ends the waiting, even with no prose at all.
  let silent = applyEvent(startTurn('hi'), { type: 'status', status: 'drafting' });
  silent = applyEvent(silent, { type: 'component', name: 'start_practice', props: {} });
  assert.equal(silent.status, null);
});

test('turn: done carries the thread forward and keeps an existing one', () => {
  let turn = applyEvent(startTurn('hi'), { type: 'done', thread_id: 't-new' });
  assert.equal(turn.done, true);
  assert.equal(turn.threadId, 't-new');

  // A done without an id must not erase the thread the turn started in.
  let continued = startTurn('again', 't-existing');
  continued = applyEvent(continued, { type: 'done', thread_id: null });
  assert.equal(continued.threadId, 't-existing');
});

test('turn: an error closes the turn, and nothing reopens it', () => {
  let turn = applyEvent(startTurn('hi'), { type: 'error', code: 'quota', message: 'No messages left.' });
  assert.equal(turn.done, true);
  assert.equal(turn.status, null);
  assert.deepEqual(turn.error, { code: 'quota', message: 'No messages left.' });

  // Late events after the close are ignored rather than reviving the turn.
  const after = applyEvents(turn, [
    { type: 'text', delta: 'surprise' },
    { type: 'status', status: 'thinking' },
    { type: 'done', thread_id: 't1' },
  ]);
  assert.deepEqual(after, turn);
});

test('turn: a stream that stops early keeps what arrived and says what happened', () => {
  let turn = applyEvents(startTurn('hi'), [
    { type: 'status', status: 'thinking' },
    { type: 'text', delta: 'Half an ans' },
  ]);
  turn = endWithoutDone(turn);
  assert.equal(turn.done, true);
  assert.equal(turn.status, null, 'it must not be left thinking for ever');
  assert.equal(turn.error?.code, 'disconnected');
  assert.equal(turn.parts[0].text, 'Half an ans', 'a cut-off answer is still worth reading');

  // A turn that finished properly is left alone.
  const finished = applyEvent(startTurn('hi'), { type: 'done', thread_id: 't1' });
  assert.deepEqual(endWithoutDone(finished), finished);
});

test('turn: an empty delta changes nothing', () => {
  const turn = startTurn('hi');
  assert.deepEqual(applyEvent(turn, { type: 'text', delta: '' }), turn);
});
