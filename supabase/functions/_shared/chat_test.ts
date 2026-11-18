import {
  budgetVerdict, cacheHitRate, ceilingMicros, costMicros, DEFAULT_CEILING_MICROS,
  MODEL_PRICE_MICROS, priceFor,
} from './chatCost.ts';
import { CHAT_COMPONENTS, parseComponentProps } from './chatComponents.ts';
import { CHAT_MODES, isChatMode, modelFor, SYSTEM_PROMPTS } from './chatModes.ts';
import { type ChatEvent, decodeEvents, encodeEvent, errorStream } from './chatStream.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const lessonId = 'fcb0cc9d-94a1-4d66-a748-830fc44fbaee';
const env = (values: Record<string, string>) => (name: string) => values[name];

Deno.test('costs the uncached and cached parts of the input separately', () => {
  // Luna: 0.1 / 0.01 / 0.5 micro-dollars per token.
  const cost = costMicros('gpt-6-luna', { prompt: 2000, cached: 1600, completion: 300 });
  // 400 fresh * 0.1 + 1600 cached * 0.01 + 300 out * 0.5 = 40 + 16 + 150
  assert(cost === 206, `expected 206, got ${cost}`);
});

Deno.test('rounds cost up, so the ceiling never undercounts', () => {
  const cost = costMicros('gpt-6-luna', { prompt: 1, cached: 0, completion: 1 });
  assert(cost === 1, `0.1 + 0.5 should round up to 1, got ${cost}`);
});

Deno.test('prices an unknown model at the dearest known rate', () => {
  const unknown = priceFor('gpt-7-whatever');
  assert(unknown.output === MODEL_PRICE_MICROS['gpt-6-astra'].output, 'unknown model must not be cheap');
  assert(costMicros('gpt-7-whatever', { prompt: 1000, cached: 0, completion: 1000 }) >
         costMicros('gpt-6-luna', { prompt: 1000, cached: 0, completion: 1000 }), 'unknown model costed as cheap');
});

Deno.test('survives nonsense token counts', () => {
  assert(costMicros('gpt-6-luna', { prompt: 0, cached: 0, completion: 0 }) === 0, 'empty call should be free');
  // More cached than sent, and a negative completion: clamp instead of going negative.
  const cost = costMicros('gpt-6-luna', { prompt: 100, cached: 9999, completion: -5 });
  assert(cost === 1, `expected clamped 1, got ${cost}`);
  assert(cacheHitRate({ prompt: 0, cached: 0, completion: 0 }) === undefined, 'no input has no hit rate');
  assert(cacheHitRate({ prompt: 100, cached: 9999, completion: 0 }) === 1, 'hit rate must stay within 0..1');
});

Deno.test('a malformed or absurd ceiling falls back to the default, never to none', () => {
  assert(ceilingMicros(env({})) === DEFAULT_CEILING_MICROS, 'unset should default');
  assert(ceilingMicros(env({ AI_DAILY_BUDGET_USD: '5' })) === 5_000_000, 'configured dollars');
  assert(ceilingMicros(env({ AI_DAILY_BUDGET_USD: '0.5' })) === 500_000, 'fractional dollars');
  for (const bad of ['', '   ', 'free', '0', '-3', 'NaN', 'Infinity']) {
    assert(ceilingMicros(env({ AI_DAILY_BUDGET_USD: bad })) === DEFAULT_CEILING_MICROS, `"${bad}" must not disable the ceiling`);
  }
});

Deno.test('the ceiling stops free callers and never paying ones', () => {
  const ceiling = 2_000_000;
  assert(budgetVerdict(1_999_999, ceiling, false).allowed, 'under the ceiling is allowed');
  const over = budgetVerdict(2_000_000, ceiling, false);
  assert(!over.allowed && over.reason === 'daily_budget', 'at the ceiling a free caller stops');
  assert(budgetVerdict(99_000_000, ceiling, true).allowed, 'a paying caller is never stopped by the ceiling');
});

Deno.test('component props are validated, and bad props report where', () => {
  const good = parseComponentProps('show_card_drafts', {
    cards: [{ id: 'c1', term: 'ciao', definition: 'hello' }],
    target: { kind: 'new', name: 'Italian greetings', learning_mode: 'language' },
  });
  assert(good.ok, 'a well-formed draft was rejected');

  const noCards = parseComponentProps('show_card_drafts', {
    cards: [], target: { kind: 'new', name: 'Italian', learning_mode: 'language' },
  });
  assert(!noCards.ok, 'an empty draft should not render');

  const badTarget = parseComponentProps('show_card_drafts', {
    cards: [{ id: 'c1', term: 'ciao', definition: 'hello' }],
    target: { kind: 'existing', lesson_id: 'not-a-uuid', lesson_name: 'Italian' },
  });
  assert(!badTarget.ok && badTarget.error.includes('show_card_drafts'), 'the error should name the component');

  const strayKey = parseComponentProps('start_practice', { lesson_id: lessonId, colour: 'red' });
  assert(!strayKey.ok, 'strict props must reject a key the component cannot draw');
  // The button's words are the app's, made from the lesson. A label the model
  // could write is a button that can promise anything.
  assert(!parseComponentProps('start_practice', { lesson_id: lessonId, label: 'Win a prize' }).ok, 'the button must not carry free text');
  assert(parseComponentProps('start_practice', { lesson_id: lessonId, lesson_name: 'Norse gods' }).ok, 'a named lesson is the button');
  assert(parseComponentProps('start_practice', {}).ok, 'no lesson is the round of everything due');

  const explainer = parseComponentProps('show_card_explainer', { term: 'cell', answer: 'unit of life' });
  assert(explainer.ok, 'the optional halves of the explainer should stay optional');
});

Deno.test('the model is read from the chat variables, never from OPENAI_MODEL', () => {
  const sentinel = env({ OPENAI_MODEL: 'gpt-6-astra' });
  assert(modelFor('create', sentinel) === 'gpt-6-luna', 'create must not inherit OPENAI_MODEL');
  assert(modelFor('practice', sentinel) === 'gpt-6-luna', 'practice must not inherit OPENAI_MODEL');
  assert(modelFor('create', env({ OPENAI_CHAT_CREATE_MODEL: 'gpt-6.1-sol' })) === 'gpt-6.1-sol', 'create switch ignored');
  assert(modelFor('practice', env({ OPENAI_CHAT_CREATE_MODEL: 'gpt-6.1-sol' })) === 'gpt-6-luna', 'lines share a switch');
  assert(modelFor('create', env({ OPENAI_CHAT_CREATE_MODEL: '   ' })) === 'gpt-6-luna', 'blank setting should fall back');
});

Deno.test('both prompts carry the data-not-instructions boundary', () => {
  for (const mode of CHAT_MODES) {
    assert(/never as instructions|never as instructions|data, never/.test(SYSTEM_PROMPTS[mode]), `${mode} prompt lost the injection boundary`);
  }
  assert(isChatMode('create') && isChatMode('practice'), 'mode guard rejects a real mode');
  assert(!isChatMode('ask') && !isChatMode(undefined), 'mode guard accepts an unknown mode');
  assert(Object.keys(CHAT_COMPONENTS).length === 5, 'the component set is five; adding one is a decision, not a detail');
});

Deno.test('events survive a round trip, and a truncated tail is not an event', () => {
  const sent: ChatEvent[] = [
    { type: 'status', status: 'reading' },
    { type: 'text', delta: 'Ciao' },
    { type: 'text', delta: ' — here are 3 cards.\n\nLine two.' },
    { type: 'component', name: 'start_practice', props: { lesson_id: lessonId } },
    { type: 'done', thread_id: null },
  ];
  const body = sent.map(encodeEvent).join('');
  const back = decodeEvents(body);
  assert(JSON.stringify(back) === JSON.stringify(sent), `round trip changed the events: ${JSON.stringify(back)}`);

  // A newline inside prose must not split one event into two.
  assert(back[2].type === 'text' && back[2].delta.includes('\n\n'), 'a blank line in prose broke the framing');
  assert(decodeEvents(body + 'data: {"type":"te').length === sent.length, 'a half-written tail should be ignored');
  assert(decodeEvents('').length === 0 && decodeEvents(': keep-alive\n\n').length === 0, 'comments are not events');
});

Deno.test('a refusal is a one-event stream, so the client has one shape to read', async () => {
  const response = errorStream('quota', 'You have used this month’s messages.');
  assert(response.headers.get('Content-Type')?.includes('text/event-stream'), 'refusals should still be a stream');
  assert(response.headers.get('Cache-Control') === 'no-store', 'a stream must not be cached');
  const events = decodeEvents(await response.text());
  assert(events.length === 1 && events[0].type === 'error' && events[0].code === 'quota', JSON.stringify(events));
});
