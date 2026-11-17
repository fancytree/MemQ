import {
  budgetVerdict, cacheHitRate, ceilingMicros, costMicros, DEFAULT_CEILING_MICROS,
  MODEL_PRICE_MICROS, priceFor,
} from './chatCost.ts';
import { CHAT_COMPONENTS, CHAT_COMPONENT_NAMES, isChatComponent, parseComponentProps } from './chatComponents.ts';
import { CHAT_MODES, CHAT_QUOTA, CHAT_TOOLS, componentsFor, isChatMode, modelFor, serverToolsFor, SYSTEM_PROMPTS, toolKind } from './chatModes.ts';
import { type ChatEvent, decodeEvents, encodeEvent, errorStream } from './chatStream.ts';
import { chatToolset, toResponsesTools } from './chatToolset.ts';

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

  const explainer = parseComponentProps('show_card_explainer', { term: 'cell', answer: 'unit of life' });
  assert(explainer.ok, 'the optional halves of the explainer should stay optional');
});

Deno.test('every whitelisted client tool is a real component, and each component belongs to one line', () => {
  for (const mode of CHAT_MODES) {
    for (const [name, kind] of Object.entries(CHAT_TOOLS[mode])) {
      if (kind === 'client') assert(isChatComponent(name), `${mode} lists a component that does not exist: ${name}`);
      else assert(!isChatComponent(name), `${mode} runs a component on the server: ${name}`);
    }
  }
  for (const name of CHAT_COMPONENT_NAMES) {
    const lines = CHAT_MODES.filter((mode) => CHAT_TOOLS[mode][name] === 'client');
    assert(lines.length <= 1, `${name} is reachable from ${lines.length} lines; a component belongs to one`);
  }
});

Deno.test('the components without data behind them are not offered yet', () => {
  // show_study_overview and show_struggling_cards need the read-only progress tools
  // that Phase 4 adds. Offered before then, the model could only invent the
  // numbers, which is worse than not having the interface. This list is the record
  // of that, and it should shrink to nothing when those tools land.
  const waiting = CHAT_COMPONENT_NAMES.filter((name) => !CHAT_MODES.some((mode) => CHAT_TOOLS[mode][name] === 'client'));
  assert(
    waiting.length === 2 && waiting.includes('show_study_overview') && waiting.includes('show_struggling_cards'),
    `expected exactly the two progress components to be waiting, got [${waiting.join(', ')}]`,
  );
});

Deno.test('neither line can see a destructive tool', () => {
  for (const mode of CHAT_MODES) {
    for (const name of Object.keys(CHAT_TOOLS[mode])) {
      assert(!name.startsWith('delete_'), `${mode} must not expose ${name}`);
    }
  }
});

Deno.test('the two lines stay apart: tools, quotas and prompts', () => {
  assert(componentsFor('create').includes('show_card_drafts'), 'create needs its draft component');
  assert(!componentsFor('create').includes('start_practice'), 'create should not start practice');
  assert(componentsFor('practice').includes('start_practice'), 'practice needs its button');
  assert(!componentsFor('practice').includes('show_card_drafts'), 'practice should not draft cards');
  assert(serverToolsFor('create').includes('draft_lesson'), 'create needs the thin tool');
  assert(serverToolsFor('practice').length === 0, 'practice has no server tools until the progress tools land');
  assert(CHAT_QUOTA.create.feature !== CHAT_QUOTA.practice.feature, 'the two pools must be separate');
  assert(CHAT_QUOTA.create.period === 'month' && CHAT_QUOTA.practice.period === 'month', 'quotas are monthly');
  assert(toolKind('create', 'start_practice') === undefined, 'a tool from the other line must not resolve');
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

function fakeDb() {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; },
    async range() { return { data: [], error: null }; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  return { from: () => q, rpc: async () => ({ data: null, error: null }) } as unknown as Parameters<typeof chatToolset>[1]['supabase'];
}
const deps = { supabase: fakeDb(), userId: 'user-a', draft: async () => ({ cards: [] }) };

Deno.test('each line assembles exactly the tools its whitelist names', () => {
  const create = chatToolset('create', deps);
  const practice = chatToolset('practice', deps);
  assert(create.map((t) => t.name).sort().join(',') === 'draft_lesson,list_cards,list_lessons,show_card_drafts', create.map((t) => t.name).join(','));
  assert(practice.map((t) => t.name).sort().join(',') === 'show_card_explainer,start_practice', practice.map((t) => t.name).join(','));
  for (const tool of [...create, ...practice]) {
    assert(tool.description.length > 20, `${tool.name} needs a description the model can act on`);
    assert(tool.parameters.type === 'object', `${tool.name} parameters must be an object schema`);
    assert((tool.kind === 'server') === (typeof tool.run === 'function'), `${tool.name}: kind and run disagree`);
  }
});

Deno.test('no write or destructive tool reaches either line', () => {
  for (const mode of CHAT_MODES) {
    for (const tool of chatToolset(mode, deps)) {
      assert(!/^(delete|update|create|add|replace)_/.test(tool.name) || tool.name === 'draft_lesson',
        `${mode} can reach a writing tool: ${tool.name}`);
    }
  }
});

Deno.test('the provider shape keeps names and turns strict off', () => {
  const sent = toResponsesTools(chatToolset('create', deps));
  assert(sent.every((t) => t.type === 'function' && t.strict === false), 'tool shape');
  assert(sent.every((t) => typeof t.name === 'string' && t.parameters), 'every tool needs a name and a schema');
  const drafts = sent.find((t) => t.name === 'show_card_drafts');
  // additionalProperties:false is what makes a stray prop fail instead of render.
  assert(JSON.stringify(drafts?.parameters).includes('"additionalProperties":false'), 'component schema lost its strictness');
});
