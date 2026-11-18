/**
 * Who gets in, how often, and what is filed afterwards.
 */

import {
  admit, ALLOWANCES, CHAT_DRAFT_FEATURE, decide, internalToken, isInternalCall, periodStart, usageOf, addUsage, NO_USAGE,
  type GateStore,
} from './aiGate.ts';
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

Deno.test('the free tier is the one that was agreed', () => {
  const a = ALLOWANCES;
  assert(a.lessonGenerate.free.limit === 5 && a.lessonGenerate.free.period === 'month', 'five generated lessons a month');
  assert(a.pdfProcess.free.limit === 3 && a.pdfProcess.free.period === 'lifetime', 'three PDFs, ever');
  assert(a.gradeAnswer.free.limit === 200 && a.gradeAnswer.free.period === 'day', 'marking has a ceiling, not a quota');
  assert(a.questionGenerate.free.period === 'day' && a.cardFill.free.period === 'day', 'everyday things are counted by the day');
  // Paying raises every limit and removes none: an account is not an API.
  for (const one of Object.values(a)) {
    assert(Number.isFinite(one.pro.limit) && one.pro.limit > one.free.limit, `${one.feature} must stay bounded for Pro`);
    assert(one.refusal.length > 20 && !/quota|limit exceeded/i.test(one.refusal), `${one.feature} must say something a person can act on`);
  }
  assert(new Set(Object.values(a).map((one) => one.feature)).size === Object.keys(a).length, 'each is counted on its own');
});

Deno.test('windows are counted in UTC', () => {
  const now = new Date('2026-11-18T23:30:00-05:00'); // already the 19th in UTC
  assert(periodStart('day', now) === '2026-11-19T00:00:00.000Z', String(periodStart('day', now)));
  assert(periodStart('month', now) === '2026-11-01T00:00:00.000Z', String(periodStart('month', now)));
  assert(periodStart('lifetime', now) === null, 'ever has no start');
});

Deno.test('one more is allowed below the limit and refused at it', () => {
  const base = { allowance: ALLOWANCES.lessonGenerate, isPro: false, spentMicros: 0, ceilingMicros: DEFAULT_CEILING_MICROS };
  assert(decide({ ...base, used: 4 }).allowed, 'the fifth is allowed');
  const full = decide({ ...base, used: 5 });
  assert(!full.allowed && full.code === 'quota' && full.limit === 5 && full.period === 'month', JSON.stringify(full));
  assert(!full.allowed && full.message === ALLOWANCES.lessonGenerate.refusal, 'told what they can still do');
  // Paying moves the limit; it does not remove it.
  assert(decide({ ...base, isPro: true, used: 5 }).allowed, 'Pro is past the free limit');
  const proFull = decide({ ...base, isPro: true, used: 300 });
  assert(!proFull.allowed && proFull.code === 'quota' && !/free/i.test(proFull.message), JSON.stringify(proFull));
});

Deno.test('a count that could not be read is treated as used up', () => {
  const verdict = decide({ allowance: ALLOWANCES.gradeAnswer, isPro: false, used: null, spentMicros: 0, ceilingMicros: DEFAULT_CEILING_MICROS });
  assert(!verdict.allowed && verdict.code === 'quota', 'a failed query must not hand out free capacity');
});

Deno.test('the day’s ceiling outranks the allowance, and paying callers pass it', () => {
  const spent = { allowance: ALLOWANCES.lessonGenerate, used: 0, spentMicros: DEFAULT_CEILING_MICROS, ceilingMicros: DEFAULT_CEILING_MICROS };
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
  const world = fake({ used: 3 });
  const refused = await admit({ store: world.store, allowance: ALLOWANCES.pdfProcess, authorization: SESSION });
  assert(!refused.ok && refused.status === 429, 'refused, and not as a server error');
  assert(!refused.ok && refused.body.code === 'quota' && refused.body.limit === 3 && refused.body.period === 'lifetime', JSON.stringify(!refused.ok && refused.body));
  // Counted over the right window: ever, for a PDF.
  assert(world.asked[0].feature === 'pdf_process' && world.asked[0].since === null, JSON.stringify(world.asked));
});

Deno.test('Pro is counted over its own window', async () => {
  const world = fake({ pro: true, used: 10 });
  const now = new Date('2026-11-18T10:00:00Z');
  const let_in = await admit({ store: world.store, allowance: ALLOWANCES.pdfProcess, authorization: SESSION, now });
  assert(let_in.ok && let_in.gate.isPro, 'ten PDFs is fine for Pro');
  assert(world.asked[0].since === '2026-11-01T00:00:00.000Z', 'a month for Pro, where free is ever');
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
