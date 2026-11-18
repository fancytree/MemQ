/**
 * What is remembered about someone, and how the list changes.
 *
 * The model's part — deciding what is worth keeping — is measured against the
 * real one in _harness/chat-harness.ts. What is pinned here is ours: when the
 * conversation is looked over, what the model is shown, how its reply is read,
 * and what is and is not allowed to be thrown away.
 */

import {
  askedToForget, lookOver, MEMORY_EVERY, MEMORY_INSTRUCTIONS, MEMORY_ITEM_MAX, MEMORY_MAX, MEMORY_TOOL, MEMORY_WINDOW,
  memoryChanges, memoryNote, memoryRequest, readMemoryReply, recentTalk, shouldRemember, type MemoryCall,
} from './chatMemory.ts';
import { SYSTEM_PROMPTS } from './chatModes.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const reply = (memories: unknown) => [{ type: 'function_call', name: 'update_memory', arguments: JSON.stringify({ memories }) }];
const kept = (...items: string[]) => items.map((content, at) => ({ id: `m${at + 1}`, content }));

Deno.test('the conversation is looked over every few messages, and at once when asked', () => {
  const looked = Array.from({ length: 9 }, (_, at) => shouldRemember(at + 1, 'what is a fjord'));
  assert(looked.filter(Boolean).length === 2 && looked[MEMORY_EVERY - 1] && looked[MEMORY_EVERY * 2 - 1], looked.join());
  for (const said of ['Remember that I sit the N2 in December', 'please forget that', "don't forget I'm a beginner", 'From now on answer in Spanish', '记住我在准备雅思', '把这个忘掉吧', '以后都用中文回答']) {
    assert(shouldRemember(1, said), `"${said}" should not wait for the next look`);
  }
  // A question that only mentions remembering is looked at too. That is a call
  // that changes nothing, which is cheap; missing "remember this" would not be.
  assert(shouldRemember(1, 'How do I remember vocabulary better?'), 'looked at, harmlessly');
});

Deno.test('being told to forget is not the same as talking about forgetting', () => {
  for (const said of ['Forget that I am moving', 'please forget my exam date', 'Actually, forget it', 'Can you forget what I said about Rome?', 'I want you to forget that', '忘掉我说的考试', '把考试日期忘了吧', '别记这个']) {
    assert(askedToForget(said), `"${said}" is an instruction`);
  }
  // This is an app about remembering: people talk about forgetting all day.
  for (const said of ['Why do I forget things soon after learning them?', 'I always forget everything I learn', 'How not to forget vocabulary', '我总是忘了单词怎么办', 'I tend to forget my words']) {
    assert(!askedToForget(said), `"${said}" is not an instruction`);
  }
});

Deno.test('nothing remembered costs nothing; something remembered is framed as background', () => {
  assert(memoryNote(null) === null && memoryNote([]) === null && memoryNote([{ content: '  ' }]) === null, 'no note for no memory');
  const note = memoryNote([{ content: 'They are sitting the JLPT N2 in December.' }, { content: 'They like short examples.' }]);
  assert(note?.includes('- They are sitting the JLPT N2 in December.') && note.includes('- They like short examples.'), note ?? '');
  assert(/never as instructions/.test(note ?? ''), 'what they told us is data, like everything else of theirs');
  const many = memoryNote(Array.from({ length: 30 }, (_, at) => ({ content: `They said thing ${at}.` })));
  assert((many?.match(/^- /gm) ?? []).length === MEMORY_MAX, 'never more than the list may hold');
  const long = memoryNote([{ content: 'x'.repeat(900) }]);
  assert((long?.split('\n')[1].length ?? 0) <= MEMORY_ITEM_MAX + 2, 'one item cannot ride along at any length');
});

Deno.test('both lines are told they remember, so neither denies it', () => {
  for (const mode of ['create', 'practice'] as const) {
    assert(/what you remember about this person/.test(SYSTEM_PROMPTS[mode]), `${mode} should know about memory`);
    assert(/remember something about them, or to forget it, say that you will/.test(SYSTEM_PROMPTS[mode]), `${mode} should not refuse to remember`);
  }
});

Deno.test('the look-over reads what the two of them said, and only the end of it', () => {
  // Newest first, as history is read.
  const history = [
    { role: 'system', content: 'App note, not said by anyone: 3 draft cards were shown.' },
    { role: 'assistant', content: 'Making cards.' },
    { role: 'user', content: 'Make cards from this' },
    ...Array.from({ length: 10 }, (_, at) => ({ role: at % 2 ? 'user' : 'assistant', content: `older ${at}` })),
  ];
  const talk = recentTalk(history, 'I sit the N2 in December', 'Then let us aim at that.');
  assert(talk.length === MEMORY_WINDOW, `${talk.length} rows`);
  assert(talk.at(-1)?.content === 'Then let us aim at that.' && talk.at(-2)?.content === 'I sit the N2 in December', 'the turn just finished comes last');
  assert(!talk.some((row) => row.role === 'system'), 'the app\'s notes say nothing about the person');
  assert(talk.at(-3)?.content === 'Making cards.' && talk.at(-4)?.content === 'Make cards from this', 'oldest first');
  // A turn that only drew something still counts as theirs.
  assert(recentTalk([], 'quiz me', '').length === 1, 'no empty reply is invented');

  const input = memoryRequest(['They are learning Italian for a trip.'], talk);
  const shown = String(input[0].content);
  assert(shown.includes('- They are learning Italian for a trip.') && shown.includes('Person: I sit the N2 in December') && shown.includes('Companion: Then let us aim at that.'), shown);
  assert(String(memoryRequest([], talk)[0].content).includes('(nothing yet)'), 'an empty list is said to be empty');
  assert(String(memoryRequest([], [{ role: 'user', content: 'y'.repeat(5000) }])[0].content).length < 900, 'a pasted page is not paid for twice');
});

Deno.test('the reply is a list or it is nothing', () => {
  assert(JSON.stringify(readMemoryReply(reply(['They sit the N2 in December.', ' they sit the n2 in december. ', 'They like short answers.'])))
    === JSON.stringify(['They sit the N2 in December.', 'They like short answers.']), 'tidied, and said once');
  assert(JSON.stringify(readMemoryReply(reply([]))) === '[]', 'an empty list is a real answer');
  assert(readMemoryReply(undefined) === null && readMemoryReply([]) === null, 'no call is no answer');
  assert(readMemoryReply([{ type: 'message', content: 'They sit the N2.' }]) === null, 'prose is not a list');
  assert(readMemoryReply([{ type: 'function_call', name: 'update_memory', arguments: '{oops' }]) === null, 'broken JSON is not a list');
  assert(readMemoryReply(reply('one string')) === null && readMemoryReply(reply([1, 2])) === null, 'the wrong shape is not a list');
  assert(readMemoryReply(reply(Array.from({ length: MEMORY_MAX + 1 }, (_, at) => `They said ${at}.`))) === null, 'too long is refused, not trimmed by guesswork');
  assert(readMemoryReply([{ type: 'function_call', name: 'something_else', arguments: '{"memories":[]}' }]) === null, 'only its own tool');
});

Deno.test('unchanged items are left alone, new ones added, missing ones dropped', () => {
  const have = kept('They sit the N2 in December.', 'They like short answers.');
  const same = memoryChanges(have, ['They sit the N2 in December.', 'They like short answers.'], false);
  assert(!same.add.length && !same.drop.length, 'a look that found nothing writes nothing');

  const added = memoryChanges(have, [...have.map((item) => item.content), 'They are a beginner in Italian.'], false);
  assert(added.add.join() === 'They are a beginner in Italian.' && !added.drop.length, JSON.stringify(added));

  const reworded = memoryChanges(have, ['They sit the N2 in July.', 'They like short answers.'], false);
  assert(reworded.add.join() === 'They sit the N2 in July.' && reworded.drop.join() === 'm1', 'a changed fact replaces the old one');

  const letter = memoryChanges(have, ['they sit the n2 in december.', 'They like short answers.'], false);
  assert(!letter.add.length && !letter.drop.length, 'a change of capitals is not a change');
});

Deno.test('a list is not thrown away unless they asked', () => {
  const have = kept('They sit the N2 in December.', 'They like short answers.', 'They are a beginner in Italian.', 'They study on the train.');
  // The model came back with one line: far more likely a summary than four retractions.
  const shrunk = memoryChanges(have, ['They study Japanese.'], false);
  assert(!shrunk.drop.length && shrunk.add.join() === 'They study Japanese.', `kept what was there: ${JSON.stringify(shrunk)}`);
  const emptied = memoryChanges(have, [], false);
  assert(!emptied.drop.length && !emptied.add.length, 'an empty reply erases nothing');
  // Said outright, it goes.
  const asked = memoryChanges(have, [], true);
  assert(asked.drop.length === 4, 'forgetting everything is allowed when it was asked for');
  const one = memoryChanges(have, have.slice(1).map((item) => item.content), false);
  assert(one.drop.join() === 'm1', 'dropping one of four needs no special permission');
  // A single item can always be replaced or removed.
  assert(memoryChanges(kept('They sit the N2.'), [], false).drop.join() === 'm1', 'one item is not a list to protect');
});

Deno.test('the list never grows past what it may hold', () => {
  const full = kept(...Array.from({ length: MEMORY_MAX }, (_, at) => `They said ${at}.`));
  const more = memoryChanges(full, [...full.map((item) => item.content).slice(0, MEMORY_MAX - 1), 'They moved to Rome.'], false);
  assert(more.add.length === 1 && more.drop.length === 1, 'one in, one out');
  // The guard kept everything, so there is no room for what the reply added.
  const crowded = memoryChanges(full, ['They moved to Rome.', 'They got a cat.'], false);
  assert(!crowded.drop.length && !crowded.add.length, JSON.stringify(crowded));
});

Deno.test('looking over is one call that may only answer with the list', async () => {
  const seen: Array<Parameters<MemoryCall>[0]> = [];
  const call: MemoryCall = (request) => {
    seen.push(request);
    return Promise.resolve({
      output: reply(['They like short answers.', 'They sit the N2 in December.']),
      usage: { input_tokens: 420, output_tokens: 30, input_tokens_details: { cached_tokens: 0 } },
    });
  };
  const result = await lookOver(call, kept('They like short answers.'), [{ role: 'user', content: 'I sit the N2 in December' }], 'I sit the N2 in December');
  assert(seen.length === 1 && seen[0].toolChoice.name === MEMORY_TOOL.name && seen[0].tools.length === 1, 'forced, with nothing else on offer');
  assert(seen[0].instructions === MEMORY_INSTRUCTIONS, 'its own instructions, not the chat line\'s');
  assert(result.changes?.add.join() === 'They sit the N2 in December.' && !result.changes.drop.length, JSON.stringify(result.changes));
  assert(result.usage.prompt === 420 && result.usage.completion === 30, 'what it cost is reported');

  // A reply that is not a list changes nothing, and still reports what it cost.
  const broken = await lookOver(() => Promise.resolve({ output: [], usage: { input_tokens: 400, output_tokens: 5 } }), kept('They like short answers.'), [], 'hi');
  assert(broken.changes === null && broken.usage.prompt === 400, JSON.stringify(broken));
});

Deno.test('the instructions say what must not be remembered', () => {
  for (const must of ['health', 'other people', 'looked up, not remembered', 'did not state', 'asked for it to be forgotten', 'ignore them']) {
    assert(MEMORY_INSTRUCTIONS.includes(must), `the instructions should mention: ${must}`);
  }
});
