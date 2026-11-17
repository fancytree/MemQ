import { draftLesson, draftLessonInput, generatorFor, slimForModel, withDetails } from './draftLesson.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function fakeGenerator(body: unknown, ok = true) {
  const calls: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
      auth: new Headers(init?.headers).get('Authorization'),
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

Deno.test('language details are drafted, but never handed to the model', async () => {
  const details = { language_code: 'it-IT', pronunciation: 'eel KON-toh', example: 'Il conto, per favore.' };
  const fake = fakeGenerator({ results: [
    { term: 'il conto', definition: 'the bill', language_data: details },
    { term: 'senza glutine', definition: 'gluten free' },
  ] });
  const draft = await draftLesson({ topic: 'Italian', learning_mode: 'language' }, fake.ctx);
  assert(draft.cards[0].language_data?.pronunciation === 'eel KON-toh', 'details should survive drafting');
  assert(draft.cards[1].language_data === null, 'a card without details gets null');

  const slim = slimForModel(draft);
  assert(!('language_data' in slim.cards[0]), 'the model must not be sent the details');
  assert(slim.cards[0].term === 'il conto' && slim.cards.length === 2, 'the rest of the card survives slimming');
  assert(draft.cards[0].language_data !== undefined, 'slimming must not mutate the draft it was given');
});

Deno.test('details are put back on the right cards, by id', () => {
  const details = new Map([
    ['d1', { pronunciation: 'eel KON-toh' }],
    ['d2', { pronunciation: 'SEN-tsa GLOO-tee-neh' }],
  ]);
  // The model reordered them, dropped one and invented one.
  const props = { cards: [
    { id: 'd2', term: 'senza glutine', definition: 'gluten free' },
    { id: 'd9', term: 'invented', definition: 'not from the draft' },
  ], target: { kind: 'new', name: 'x', learning_mode: 'language' } };

  const merged = withDetails(props, details) as { cards: Array<Record<string, unknown>> };
  assert((merged.cards[0].language_data as { pronunciation: string }).pronunciation === 'SEN-tsa GLOO-tee-neh', 'd2 got the wrong details');
  assert(!('language_data' in merged.cards[1]), 'an invented id must not pull in someone else’s details');
  assert(merged.cards.length === 2 && merged.cards[0].term === 'senza glutine', 'the model’s own fields survive');
});

Deno.test('merging copes with nothing to merge and with nonsense', () => {
  const empty = new Map();
  const props = { cards: [{ id: 'd1', term: 'a', definition: 'b' }] };
  assert(withDetails(props, empty) === props, 'no details means no work');
  const some = new Map([['d1', { pronunciation: 'x' }]]);
  assert(withDetails(null, some) === null && withDetails('nope', some) === 'nope', 'non-objects pass through');
  assert(withDetails({ target: {} }, some) !== undefined, 'props without cards pass through');
  const odd = withDetails({ cards: [null, 7] }, some) as { cards: unknown[] };
  assert(odd.cards[0] === null && odd.cards[1] === 7, 'unusable entries are left alone');
});
