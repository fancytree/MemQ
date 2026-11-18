/**
 * Who gets in, how often, and what is filed afterwards.
 */

import {
  admit, ALLOWANCES, CHAT_DRAFT_FEATURE, decide, internalToken, isInternalCall, periodStart, usageOf, addUsage, NO_USAGE,
  type GateStore,
} from './aiGate.ts';
import {
  CREDIT_COST, CREDIT_FEATURES, CREDIT_LIMIT, creditPeriodStart, creditReset, creditsSpent, creditVerdict,
} from './aiCredits.ts';
import { DEFAULT_CEILING_MICROS } from './chatCost.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

// A direct app session: a JWT whose claims carry no client_id.
const jwt = (claims: Record<string, unknown>) => `Bearer h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;
const SESSION = jwt({ sub: 'u1' });
const OAUTH = jwt({ sub: 'u1', client_id: 'some-app' });

function fake(over: Partial<{ user: string | null; pro: boolean; used: number | null; spent: number }> = {}) {
  const state = { user: 'u1' as string | null, pro: false, used: 0 as number | null, spent: 0, ...over };
  const rows: Array<Record<string, unknown>> = [];
  const spend: number[] = [];
  const asked: Array<{ feature: string; since: string | null }> = [];
  const store: GateStore = {
    userId: () => Promise.resolve(state.user),
    isPro: () => Promise.resolve(state.pro),
    used: (_user, feature, since) => { asked.push({ feature, since }); return Promise.resolve(state.used); },
    spentToday: () => Promise.resolve(state.spent),
    record: (row) => { rows.push(row); return Promise.resolve(); },
    addSpend: (micros) => { spend.push(micros); return Promise.resolve(); },
  };
  return { store, rows, spend, asked };
}

Deno.test('what a person asks for is paid in credits, what the app does itself has a ceiling', () => {
  const a = ALLOWANCES;
  // Asked for: a set of cards, one card, a PDF. Costs come from the one table.
  for (const asked of [a.lessonGenerate, a.cardFill, a.pdfProcess]) {
    assert('credits' in asked && asked.credits === CREDIT_COST[asked.feature], `${asked.feature} costs what the table says`);
  }
  assert(a.lessonGenerate.credits === 3 && a.cardFill.credits === 1 && a.pdfProcess.credits === 10, 'three, one and ten');
  // Done by the app while someone practises: never on the allowance they see.
  for (const own of [a.questionGenerate, a.gradeAnswer, a.legacyChat, a.legacyExtract]) {
    assert(!('credits' in own) && own.free.period === 'day', `${own.feature} has a daily ceiling of its own`);
    // Paying raises every limit and removes none: an account is not an API.
    assert(Number.isFinite(own.pro.limit) && own.pro.limit > own.free.limit, `${own.feature} is bounded for Pro too`);
    assert(!(own.feature in CREDIT_COST), `${own.feature} costs no credits`);
  }
  assert(a.gradeAnswer.free.limit === 200 && a.questionGenerate.free.limit === 20, 'the ceilings that were agreed');
});

Deno.test('windows are counted in UTC', () => {
  const now = new Date('2026-11-18T23:30:00-05:00'); // already the 19th in UTC
  assert(periodStart('day', now) === '2026-11-19T00:00:00.000Z', String(periodStart('day', now)));
  assert(periodStart('month', now) === '2026-11-01T00:00:00.000Z', String(periodStart('month', now)));
  assert(periodStart('lifetime', now) === null, 'ever has no start');
});

Deno.test('a ceiling allows one more below the limit and refuses at it', () => {
  const base = { allowance: ALLOWANCES.questionGenerate, isPro: false, spentMicros: 0, ceilingMicros: DEFAULT_CEILING_MICROS };
  assert(decide({ ...base, used: 19 }).allowed, 'the twentieth is allowed');
  const full = decide({ ...base, used: 20 });
  assert(!full.allowed && full.code === 'quota' && full.limit === 20 && full.period === 'day', JSON.stringify(full));
  assert(!full.allowed && full.message === ALLOWANCES.questionGenerate.refusal, 'told what they can still do');
  assert(decide({ ...base, isPro: true, used: 20 }).allowed, 'Pro is past the free limit');
  const proFull = decide({ ...base, isPro: true, used: 200 });
  assert(!proFull.allowed && proFull.message !== ALLOWANCES.questionGenerate.refusal, 'a paying account is not offered an upgrade');
});

Deno.test('credits: it has to fit in what is left of the month', () => {
  const base = { isPro: false, spentMicros: 0, ceilingMicros: DEFAULT_CEILING_MICROS, now: new Date('2026-11-18T10:00:00Z') };
  // Fifty a month. A set of cards takes three.
  assert(decide({ ...base, allowance: ALLOWANCES.lessonGenerate, used: 47 }).allowed, 'three left is enough for three');
  const short = decide({ ...base, allowance: ALLOWANCES.lessonGenerate, used: 48 });
  assert(!short.allowed && short.code === 'quota' && short.limit === 50 && short.used === 48 && short.left === 2 && short.cost === 3, JSON.stringify(short));
  assert(!short.allowed && short.period === 'month' && short.resets === '2026-12-01T00:00:00.000Z', 'says when it comes back');
  assert(!short.allowed && /takes 3 AI credits and you have 2 left/.test(short.message), short.allowed ? '' : short.message);
  // One left still buys a card or a message, not a PDF.
  assert(decide({ ...base, allowance: ALLOWANCES.cardFill, used: 49 }).allowed, 'one left is enough for one');
  assert(!decide({ ...base, allowance: ALLOWANCES.pdfProcess, used: 41 }).allowed, 'nine left is not enough for ten');
  const none = decide({ ...base, allowance: ALLOWANCES.cardFill, used: 50 });
  assert(!none.allowed && none.left === 0 && /own AI is always free/.test(none.message), JSON.stringify(none));
  // Pro: two thousand, and nothing to sell at the end of them.
  assert(decide({ ...base, isPro: true, allowance: ALLOWANCES.pdfProcess, used: 1990 }).allowed, 'Pro has two thousand');
  const proOut = decide({ ...base, isPro: true, allowance: ALLOWANCES.cardFill, used: 2000 });
  assert(!proOut.allowed && !/own AI|Pro/.test(proOut.message), JSON.stringify(proOut));
  // A count that could not be read is everything spent.
  assert(!decide({ ...base, allowance: ALLOWANCES.cardFill, used: null }).allowed, 'unknown is not free');
});

Deno.test('credits spent are every kind of use, each at its price', () => {
  assert(creditsSpent({ ai_chat_create: 4, ai_chat: 6, card_fill: 5, lesson_generate: 3, pdf_process: 1 }) === 4 + 6 + 5 + 9 + 10, 'weighted');
  assert(creditsSpent({ ai_chat_create: 0, ai_chat: 0, card_fill: 0, lesson_generate: 0, pdf_process: 0 }) === 0, 'nothing used');
  assert(creditsSpent({ ai_chat_create: 1, ai_chat: 1, card_fill: 1, lesson_generate: 1 }) === null, 'a missing count is unknown');
  assert(creditsSpent({ ai_chat_create: 1, ai_chat: null, card_fill: 1, lesson_generate: 1, pdf_process: 1 }) === null, 'a failed count is unknown');
  assert(CREDIT_FEATURES.length === 5 && CREDIT_LIMIT.free === 50 && CREDIT_LIMIT.pro === 2000, 'the allowance that was agreed');
  assert(creditPeriodStart(new Date('2026-11-18T23:59:59Z')) === '2026-11-01T00:00:00.000Z', 'from the first, in UTC');
  assert(creditReset(new Date('2026-12-31T23:59:59Z')) === '2027-01-01T00:00:00.000Z', 'back on the first, across a year');
  const left = creditVerdict({ isPro: false, spent: 12, cost: 1 });
  assert(left.allowed && left.left === 38 && left.used === 12 && left.limit === 50, JSON.stringify(left));
  assert(creditVerdict({ isPro: false, spent: 999, cost: 1 }).left === 0, 'never less than none left');
});

Deno.test('a count that could not be read is treated as used up', () => {
  const verdict = decide({ allowance: ALLOWANCES.gradeAnswer, isPro: false, used: null, spentMicros: 0, ceilingMicros: DEFAULT_CEILING_MICROS });
  assert(!verdict.allowed && verdict.code === 'quota', 'a failed query must not hand out free capacity');
});

Deno.test('the day’s ceiling outranks the allowance, and paying callers pass it', () => {
  const spent = { allowance: ALLOWANCES.lessonGenerate, used: 0, spentMicros: DEFAULT_CEILING_MICROS, ceilingMicros: DEFAULT_CEILING_MICROS };
  // The same for something with a ceiling of its own.
  assert(!decide({ ...spent, allowance: ALLOWANCES.gradeAnswer, isPro: false }).allowed, 'the ceiling stops marking too');
  const free = decide({ ...spent, isPro: false });
  assert(!free.allowed && free.code === 'daily_budget', JSON.stringify(free));
  assert(decide({ ...spent, isPro: true }).allowed, 'paying callers are why there is a budget');
});

Deno.test('only a signed-in app session gets in', async () => {
  const none = await admit({ store: fake().store, allowance: ALLOWANCES.gradeAnswer, authorization: '' });
  assert(!none.ok && none.status === 401, 'no token');
  const oauth = await admit({ store: fake().store, allowance: ALLOWANCES.gradeAnswer, authorization: OAUTH });
  assert(!oauth.ok && oauth.status === 401, 'a connected app is sent to the MCP endpoint, not let in here');
  const stale = await admit({ store: fake({ user: null }).store, allowance: ALLOWANCES.gradeAnswer, authorization: SESSION });
  assert(!stale.ok && stale.status === 401, 'a token Auth does not accept');
});

Deno.test('a refusal carries what the app needs to explain it', async () => {
  // Three of everything this month: 3 + 3 + 3 + 9 + 30 = 48 of the fifty spent.
  const world = fake({ used: 3 });
  const now = new Date('2026-11-18T10:00:00Z');
  const refused = await admit({ store: world.store, allowance: ALLOWANCES.pdfProcess, authorization: SESSION, now });
  assert(!refused.ok && refused.status === 429, 'refused, and not as a server error');
  const body = !refused.ok ? refused.body : {};
  assert(body.code === 'quota' && body.limit === 50 && body.used === 48 && body.left === 2 && body.cost === 10, JSON.stringify(body));
  assert(body.period === 'month' && body.resets === '2026-12-01T00:00:00.000Z' && typeof body.message === 'string', JSON.stringify(body));
  // Every kind of use was counted, each from the first of the month.
  assert(world.asked.length === 5 && world.asked.every((ask) => ask.since === '2026-11-01T00:00:00.000Z'), JSON.stringify(world.asked));
  assert(['ai_chat_create', 'ai_chat', 'card_fill', 'lesson_generate', 'pdf_process'].every((f) => world.asked.some((ask) => ask.feature === f)), 'all five');
  // The same person can still do the cheap thing with what is left.
  assert((await admit({ store: fake({ used: 3 }).store, allowance: ALLOWANCES.cardFill, authorization: SESSION, now })).ok, 'two left buys a card');
});

Deno.test('a ceiling is counted on its own, over its own window', async () => {
  const world = fake({ used: 10 });
  const now = new Date('2026-11-18T10:00:00Z');
  const let_in = await admit({ store: world.store, allowance: ALLOWANCES.gradeAnswer, authorization: SESSION, now });
  assert(let_in.ok, 'ten answers marked today is nowhere near two hundred');
  assert(world.asked.length === 1 && world.asked[0].feature === 'grade_answer' && world.asked[0].since === '2026-11-18T00:00:00.000Z', JSON.stringify(world.asked));
  // Pro spends from two thousand: ten of everything is 160.
  const pro = fake({ pro: true, used: 10 });
  const paid = await admit({ store: pro.store, allowance: ALLOWANCES.pdfProcess, authorization: SESSION, now });
  assert(paid.ok && paid.gate.isPro, 'well inside what Pro has');
});

Deno.test('a use is filed once, with what it cost', async () => {
  const world = fake();
  const let_in = await admit({ store: world.store, allowance: ALLOWANCES.lessonGenerate, authorization: SESSION });
  assert(let_in.ok, 'allowed');
  const usage = { prompt: 1000, cached: 0, completion: 2000 };
  await let_in.gate.settle('gpt-6-luna', usage);
  await let_in.gate.settle('gpt-6-luna', usage);
  assert(world.rows.length === 1 && world.spend.length === 1, 'a second settle must not charge twice');
  const row = world.rows[0];
  assert(row.feature === 'lesson_generate' && row.user_id === 'u1' && row.model === 'gpt-6-luna', JSON.stringify(row));
  assert(row.prompt_tokens === 1000 && row.completion_tokens === 2000, 'the tokens are kept, so a cost can be read back');
  // 1000 x 0.1 + 2000 x 0.5 micro-dollars.
  assert(world.spend[0] === 1100, `spend ${world.spend[0]}`);
});

Deno.test('work that failed costs the project and not the person', async () => {
  const world = fake();
  const let_in = await admit({ store: world.store, allowance: ALLOWANCES.lessonGenerate, authorization: SESSION });
  assert(let_in.ok, 'allowed');
  await let_in.gate.settle('gpt-6-luna', { prompt: 500, cached: 0, completion: 0 }, { counted: false });
  assert(world.rows.length === 0 && world.spend[0] === 50, 'on the budget, off their allowance');
});

Deno.test('a call signed by chat skips the allowance and is filed apart', async () => {
  const secret = 'service-role-key';
  const now = new Date('2026-11-18T10:00:00Z');
  // At the limit, and the day's budget spent: chat already answered for both.
  const world = fake({ used: 5, spent: DEFAULT_CEILING_MICROS });
  const header = await internalToken(secret, 'u1', now.getTime());
  const let_in = await admit({
    store: world.store, allowance: ALLOWANCES.lessonGenerate, authorization: SESSION,
    internalHeader: header, serviceKey: secret, now,
  });
  assert(let_in.ok && let_in.gate.internal, 'chat was admitted at its own door');
  assert(world.asked.length === 0, 'their lesson allowance is not even read');
  await let_in.gate.settle('gpt-6-luna', { prompt: 100, cached: 0, completion: 100 });
  assert(world.rows[0].feature === CHAT_DRAFT_FEATURE, 'filed where it counts against nothing');
  assert(world.spend.length === 1, 'and its cost reaches the budget');
});

Deno.test('the signature is for one person, for a few minutes, from someone with the key', async () => {
  const secret = 'service-role-key';
  const at = Date.parse('2026-11-18T10:00:00Z');
  const token = await internalToken(secret, 'u1', at);
  assert(await isInternalCall(token, secret, 'u1', at + 60_000), 'a minute later is fine');
  assert(!await isInternalCall(token, secret, 'u2', at), 'not for somebody else');
  assert(!await isInternalCall(token, secret, 'u1', at + 10 * 60_000), 'not ten minutes later');
  assert(!await isInternalCall(token, 'another-key', 'u1', at), 'not without the key');
  assert(!await isInternalCall(token, undefined, 'u1', at), 'no key configured means nobody is internal');
  assert(!await isInternalCall(null, secret, 'u1', at) && !await isInternalCall('', secret, 'u1', at), 'no header');
  assert(!await isInternalCall(`${at}.deadbeef`, secret, 'u1', at), 'a made-up signature');
  assert(!await isInternalCall(`${token}.extra`, secret, 'u1', at) && !await isInternalCall('true', secret, 'u1', at), 'the wrong shape');

  // A header anyone could send changes nothing.
  const world = fake({ used: 5 });
  const forged = await admit({
    store: world.store, allowance: ALLOWANCES.lessonGenerate, authorization: SESSION,
    internalHeader: `${at}.${'0'.repeat(64)}`, serviceKey: secret, now: new Date(at),
  });
  assert(!forged.ok && forged.status === 429, 'a forged header is an ordinary request, and this one is out of allowance');
});

Deno.test('usage is read from what the provider reports', () => {
  const read = usageOf({ prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1000 } });
  assert(read.prompt === 1200 && read.cached === 1000 && read.completion === 300, JSON.stringify(read));
  assert(JSON.stringify(usageOf(undefined)) === JSON.stringify(NO_USAGE) && JSON.stringify(usageOf(null)) === JSON.stringify(NO_USAGE), 'nothing reported is nothing spent');
  const sum = addUsage(read, { prompt: 100, cached: 0, completion: 50 });
  assert(sum.prompt === 1300 && sum.cached === 1000 && sum.completion === 350, 'a repaired batch is paid for twice, and counted twice');
});
