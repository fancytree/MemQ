import { draftLesson, draftLessonInput, generatorFor, PASSAGE_FROM } from './draftLesson.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function fakeGenerator(body: unknown, ok = true) {
  const calls: Array<{ url: string; body: Record<string, unknown>; auth: string | null; internal: string | null }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
      auth: new Headers(init?.headers).get('Authorization'),
      internal: new Headers(init?.headers).get('x-memq-internal'),
    });
    return new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, ctx: { fetch: fetcher, functionsUrl: 'https://p.example.com/functions/v1', authorization: 'Bearer token-abc' } };
}

Deno.test('knowledge and language drafts go to the generator the create screen would pick', async () => {
  assert(generatorFor('knowledge') === 'generate-terms', 'knowledge generator');
  assert(generatorFor('language') === 'generate-vocab-terms', 'language generator');

  const fake = fakeGenerator({ results: [{ term: 'ciao', definition: 'hello', explanation: 'informal' }] });
  const draft = await draftLesson({ topic: 'Italian greetings', learning_mode: 'language' }, fake.ctx);
  assert(fake.calls[0].url.endsWith('/generate-vocab-terms'), fake.calls[0].url);
  assert(fake.calls[0].body.type === 'topic' && fake.calls[0].body.content === 'Italian greetings', JSON.stringify(fake.calls[0].body));
  assert(fake.calls[0].auth === 'Bearer token-abc', 'generation must run with the caller’s own token');
  assert(draft.cards.length === 1 && draft.cards[0].id === 'd1' && draft.cards[0].explanation === 'informal', JSON.stringify(draft));
  assert(draft.learning_mode === 'language' && draft.topic === 'Italian greetings', 'draft should echo what was asked');
});

Deno.test('a requested count is passed as a request, not a promise', async () => {
  const fake = fakeGenerator({ results: [{ term: 'a', definition: 'b' }] });
  await draftLesson({ topic: 'Cell biology', learning_mode: 'knowledge', card_count: 12 }, fake.ctx);
  assert(String(fake.calls[0].body.content).includes('Cell biology'), 'the topic should survive');
  assert(String(fake.calls[0].body.content).includes('12'), 'the count should reach the generator');
});

Deno.test('drafts skip unusable rows and number what is left contiguously', async () => {
  const fake = fakeGenerator({ results: [
    { term: 'good', definition: 'kept' },
    { term: '   ', definition: 'blank term' },
    { term: 'no definition', definition: '  ' },
    { definition: 'missing term' },
    { term: 'second', definition: 'kept too', explanation: '   ' },
  ] });
  const draft = await draftLesson({ topic: 'x', learning_mode: 'knowledge' }, fake.ctx);
  assert(draft.cards.length === 2, `expected 2 usable cards, got ${draft.cards.length}`);
  assert(draft.cards.map((c) => c.id).join(',') === 'd1,d2', 'ids should have no gaps');
  assert(draft.cards[1].explanation === null, 'a blank explanation should be null, not empty');
});

Deno.test('a draft is capped at what the component can draw', async () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ term: `t${i}`, definition: `d${i}` }));
  const fake = fakeGenerator({ results: many });
  const draft = await draftLesson({ topic: 'x', learning_mode: 'knowledge' }, fake.ctx);
  assert(draft.cards.length === 50, `expected the cap of 50, got ${draft.cards.length}`);
});

Deno.test('failures are reported in words the person can act on', async () => {
  const broken = fakeGenerator({ error: 'OPENAI_API_KEY environment variable is not set' }, false);
  let message = '';
  try { await draftLesson({ topic: 'x', learning_mode: 'knowledge' }, broken.ctx); } catch (error) { message = String(error); }
  assert(message && !message.includes('OPENAI_API_KEY'), `provider detail leaked: ${message}`);

  const empty = fakeGenerator({ results: [] });
  let emptyMessage = '';
  try { await draftLesson({ topic: 'x', learning_mode: 'knowledge' }, empty.ctx); } catch (error) { emptyMessage = String(error); }
  assert(emptyMessage.includes('specific'), `an empty draft should ask for more to go on: ${emptyMessage}`);
});

Deno.test('the tool input defaults to knowledge and refuses an empty topic', () => {
  assert(draftLessonInput.parse({ topic: 'x' }).learning_mode === 'knowledge', 'default mode');
  assert(!draftLessonInput.safeParse({ topic: '   ' }).success, 'a blank topic should not draft');
  assert(!draftLessonInput.safeParse({ topic: 'x', card_count: 0 }).success, 'zero cards is not a draft');
  assert(!draftLessonInput.safeParse({ topic: 'x', extra: 1 }).success, 'strict input should reject strays');
});

Deno.test('language details survive drafting, for the screen', async () => {
  const details = { language_code: 'it-IT', pronunciation: 'eel KON-toh', example: 'Il conto, per favore.' };
  const fake = fakeGenerator({ results: [
    { term: 'il conto', definition: 'the bill', language_data: details },
    { term: 'senza glutine', definition: 'gluten free' },
  ] });
  const draft = await draftLesson({ topic: 'Italian', learning_mode: 'language' }, fake.ctx);
  assert(draft.cards[0].language_data?.pronunciation === 'eel KON-toh', 'details should survive drafting');
  assert(draft.cards[1].language_data === null, 'a card without details gets null');
});

Deno.test('a subject is written about, and a passage is taken apart', async () => {
  // A paragraph handed over as a "topic" comes back as cards about its subject at
  // large rather than about what it says, so the generator is told which it has.
  const subject = fakeGenerator({ results: [{ term: 'a', definition: 'b' }] });
  await draftLesson({ topic: 'The planets of the solar system', learning_mode: 'knowledge' }, subject.ctx);
  assert(subject.calls[0].body.type === 'topic', `a short subject should be a topic, got ${subject.calls[0].body.type}`);

  const passage = fakeGenerator({ results: [{ term: 'a', definition: 'b' }] });
  await draftLesson({ topic: 'x'.repeat(PASSAGE_FROM + 1), learning_mode: 'knowledge' }, passage.ctx);
  assert(passage.calls[0].body.type === 'text', `a passage should be extracted from, got ${passage.calls[0].body.type}`);
});

Deno.test('a draft made for chat says so, in a way the generator can check', async () => {
  const signed = fakeGenerator({ results: [{ term: 'Odin', definition: 'Chief god.' }] });
  let made = 0;
  await draftLesson({ topic: 'Norse gods', learning_mode: 'knowledge' }, {
    ...signed.ctx, internal: () => { made += 1; return Promise.resolve('1700000000000.abc'); },
  });
  assert(signed.calls[0].internal === '1700000000000.abc', 'the signature rides on the request');
  assert(signed.calls[0].auth === 'Bearer token-abc', 'and it is still the person’s own token');
  assert(made === 1, 'made for this call, because it does not keep');

  // Without one — no service key configured, or the signing failed — the request
  // still goes, as an ordinary one. Being counted twice is the safe way to be wrong.
  const plain = fakeGenerator({ results: [{ term: 'Odin', definition: 'Chief god.' }] });
  await draftLesson({ topic: 'Norse gods', learning_mode: 'knowledge' }, plain.ctx);
  assert(plain.calls[0].internal === null, 'no header when there is nothing to say');
  const broken = fakeGenerator({ results: [{ term: 'Odin', definition: 'Chief god.' }] });
  await draftLesson({ topic: 'Norse gods', learning_mode: 'knowledge' }, {
    ...broken.ctx, internal: () => Promise.reject(new Error('no key')),
  });
  assert(broken.calls[0].internal === null && broken.calls.length === 1, 'a failed signature does not fail the draft');
});
