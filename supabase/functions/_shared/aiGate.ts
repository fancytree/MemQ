/**
 * The door every AI function goes through: who is asking, whether they still have
 * some left, and what it cost once it is done.
 *
 * Until this, only chat had one. The other functions that call a model — the two
 * that write cards, the two that write questions, the one that marks an answer,
 * the one that reads a PDF — let in anyone with a session, as often as they liked.
 * "Three generated lessons a month" was a number the app checked before it asked;
 * a request that did not come from the app was never asked anything. And none of
 * what they spent reached the day's budget, so the ceiling that is meant to stop a
 * bill could only see chat.
 *
 * What is free is written down once, here (ALLOWANCES). The shape of the free tier:
 * what someone does every day and costs next to nothing is not counted in any way
 * they will notice — marking, questions — and carries only a ceiling high enough
 * that it is never met by a person. What is dear per use, or easy to run in a loop,
 * is counted properly: generated lessons, and PDFs most of all.
 *
 * A use is counted when it worked. A request that failed costs the person nothing;
 * what it cost the project still goes on the day's budget.
 *
 * Counting is by rows in `ai_usage`, read and written as the caller, so row-level
 * security is what makes a count theirs. They can add rows of their own, which
 * only spends their own allowance; they cannot remove one.
 */

import { budgetVerdict, ceilingMicros, costMicros, type TokenUsage } from './chatCost.ts';
import { isDirectUserSession } from './directSession.ts';

export type Period = 'day' | 'month' | 'lifetime';
export type Limit = { limit: number; period: Period };

export type Allowance = {
  /** What a use is filed under in `ai_usage`. */
  feature: string;
  free: Limit;
  /** Paying is not a licence to be used as an API: high enough that no person
   *  meets it, low enough that one account cannot run up a bill. */
  pro: Limit;
  /** What a free caller is told when it runs out. Something they can act on. */
  refusal: string;
};

export const ALLOWANCES = {
  /** A set of cards from a topic or a passage. The thing that costs most per use
   *  after a PDF, and the first thing a new person tries. */
  lessonGenerate: {
    feature: 'lesson_generate',
    free: { limit: 5, period: 'month' },
    pro: { limit: 300, period: 'month' },
    refusal: 'You have used this month’s AI-generated lessons. You can still add cards by hand.',
  },
  /** Filling in one card from its term. Small, and part of typing a card. */
  cardFill: {
    feature: 'card_fill',
    free: { limit: 30, period: 'day' },
    pro: { limit: 300, period: 'day' },
    refusal: 'That is enough auto-filled cards for today. You can still write them yourself.',
  },
  /** Practice questions for a lesson. Needed to practise cards made by hand too,
   *  so it is not something to run out of in ordinary use. */
  questionGenerate: {
    feature: 'question_generate',
    free: { limit: 20, period: 'day' },
    pro: { limit: 200, period: 'day' },
    refusal: 'That is enough new question sets for today. The ones you have still work.',
  },
  /** Marking a typed answer for meaning. The heart of practice; a ceiling only. */
  gradeAnswer: {
    feature: 'grade_answer',
    free: { limit: 200, period: 'day' },
    pro: { limit: 2000, period: 'day' },
    refusal: 'Answers are being marked by their words for the rest of today.',
  },
  /** Reading a PDF. The dearest thing here, and it scales with the document. */
  pdfProcess: {
    feature: 'pdf_process',
    free: { limit: 3, period: 'lifetime' },
    pro: { limit: 100, period: 'month' },
    refusal: 'You have used your free PDF imports. You can still paste text, or add cards by hand.',
  },
  /**
   * The chat in versions of the app that are already out. The new chat has its
   * own door (chatModes.ts); these two functions are only reached by builds that
   * people still have installed, and until now were reached without any limit.
   * Generous, because nobody on an old build can be told why it stopped.
   */
  legacyChat: {
    feature: 'ai_chat_legacy',
    free: { limit: 30, period: 'day' },
    pro: { limit: 300, period: 'day' },
    refusal: 'That is all the AI chat for today. It will be back tomorrow.',
  },
  /** The old chat's second call, made after each answer to pull a term out of it. */
  legacyExtract: {
    feature: 'ai_chat_extract',
    free: { limit: 30, period: 'day' },
    pro: { limit: 300, period: 'day' },
    refusal: 'That is all the AI chat for today. It will be back tomorrow.',
  },
} as const satisfies Record<string, Allowance>;

/** Cards drafted inside a chat turn. The turn has already been counted as a chat
 *  message, so this is filed apart and counts against nothing; it exists so that
 *  what the draft cost is recorded at all. */
export const CHAT_DRAFT_FEATURE = 'chat_draft';

/** The start of the window a limit is counted over, in UTC so it does not move
 *  with where the caller happens to be. Null for "ever". */
export function periodStart(period: Period, now: Date = new Date()): string | null {
  if (period === 'lifetime') return null;
  const day = period === 'month' ? 1 : now.getUTCDate();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day)).toISOString();
}

export type GateVerdict =
  | { allowed: true }
  | { allowed: false; code: 'quota' | 'daily_budget'; message: string; limit?: number; used?: number; period?: Period };

const RESTING = 'AI is resting for today. You can still add cards by hand, and it will be back tomorrow.';
const FAIR_USE = 'That is more than this account can use for now. It will be back later.';

/**
 * Whether one more use is allowed. Pure, so the rules can be read and tested
 * without a database.
 *
 * The day's ceiling comes first: it protects the project, so it outranks any one
 * caller's allowance. A count that could not be read is treated as used up — a
 * failed query must not hand out free capacity.
 */
export function decide(input: {
  allowance: Allowance;
  isPro: boolean;
  /** Null when the count could not be read. */
  used: number | null;
  spentMicros: number;
  ceilingMicros: number;
}): GateVerdict {
  const { allowance, isPro } = input;
  if (!budgetVerdict(input.spentMicros, input.ceilingMicros, isPro).allowed) {
    return { allowed: false, code: 'daily_budget', message: RESTING };
  }
  const { limit, period } = isPro ? allowance.pro : allowance.free;
  const used = input.used ?? limit;
  if (used >= limit) {
    return { allowed: false, code: 'quota', message: isPro ? FAIR_USE : allowance.refusal, limit, used, period };
  }
  return { allowed: true };
}

/* ── One function calling another ──────────────────────────────────────────────
 *
 * Chat drafts cards by calling the same generator the create screen uses, with
 * the person's own token. To the generator that looks exactly like the person
 * asking for a lesson, and it would count one against their five a month for a
 * draft that was already counted as a chat message.
 *
 * A header saying "this is chat" cannot be taken on trust — anyone can send a
 * header. So chat signs it: an HMAC over the caller's id and the time, keyed with
 * the service-role key that only the functions hold. The key itself never travels,
 * the signature is no use for another person, and it is no use a few minutes on.
 */

export const INTERNAL_HEADER = 'x-memq-internal';
const INTERNAL_WINDOW_MS = 3 * 60 * 1000;

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time, so how much of a guess was right cannot be read off the clock. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function internalToken(secret: string, userId: string, now: number = Date.now()): Promise<string> {
  return `${now}.${await sign(secret, `${userId}.${now}`)}`;
}

export async function isInternalCall(
  header: string | null, secret: string | undefined, userId: string, now: number = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;
  const [stamp, mac, ...rest] = header.split('.');
  const at = Number(stamp);
  if (rest.length || !mac || !Number.isFinite(at) || Math.abs(now - at) > INTERNAL_WINDOW_MS) return false;
  return same(mac, await sign(secret, `${userId}.${stamp}`));
}

/* ── The door itself ─────────────────────────────────────────────────────────── */

/** What the gate needs from the outside world. The real one is built from the
 *  request (`storeFor`); the tests hand it a fake. */
export type GateStore = {
  /** The signed-in caller, or null. */
  userId: () => Promise<string | null>;
  isPro: (userId: string) => Promise<boolean>;
  /** How many uses since `since` (null = ever), or null if it could not be read. */
  used: (userId: string, feature: string, since: string | null) => Promise<number | null>;
  spentToday: () => Promise<number>;
  record: (row: Record<string, unknown>) => Promise<void>;
  addSpend: (micros: number) => Promise<void>;
};

export type Gate = {
  userId: string;
  isPro: boolean;
  /** True when another of our functions is calling on the person's behalf. */
  internal: boolean;
  /**
   * File what was used. Call it once, when the work is done.
   * `counted: false` is for work that failed after the model was paid: the cost
   * goes on the budget, and the person is not charged a use.
   */
  settle: (model: string, usage: TokenUsage, options?: { counted?: boolean }) => Promise<void>;
};

export type Admission =
  | { ok: true; gate: Gate }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function admit(input: {
  store: GateStore;
  allowance: Allowance;
  authorization: string;
  internalHeader?: string | null;
  serviceKey?: string;
  env?: (name: string) => string | undefined;
  now?: Date;
}): Promise<Admission> {
  const { store, allowance } = input;
  // Signed-in app sessions only; connected apps reach MemQ through the MCP endpoint.
  const userId = input.authorization && isDirectUserSession(input.authorization) ? await store.userId() : null;
  if (!userId) return { ok: false, status: 401, body: { error: 'Unauthorized', code: 'unauthorized' } };

  const now = input.now ?? new Date();
  const internal = await isInternalCall(input.internalHeader ?? null, input.serviceKey, userId, now.getTime());

  const [isPro, spent] = await Promise.all([store.isPro(userId), store.spentToday()]);
  const limit = isPro ? allowance.pro : allowance.free;
  // A call made for chat was admitted at chat's own door, allowance and budget both.
  if (!internal) {
    const used = await store.used(userId, allowance.feature, periodStart(limit.period, now));
    const verdict = decide({
      allowance, isPro, used, spentMicros: spent,
      ceilingMicros: ceilingMicros(input.env ?? (() => undefined)),
    });
    if (!verdict.allowed) {
      return {
        ok: false, status: 429,
        body: {
          error: verdict.message, code: verdict.code, message: verdict.message,
          ...(verdict.limit !== undefined ? { limit: verdict.limit, used: verdict.used, period: verdict.period } : {}),
        },
      };
    }
  }

  let settled = false;
  return {
    ok: true,
    gate: {
      userId, isPro, internal,
      settle: async (model, usage, options = {}) => {
        // Once: a second call would charge the same work twice.
        if (settled) return;
        settled = true;
        const counted = options.counted !== false;
        await Promise.allSettled([
          counted ? store.record({
            user_id: userId,
            feature: internal ? CHAT_DRAFT_FEATURE : allowance.feature,
            model,
            prompt_tokens: usage.prompt,
            cached_tokens: usage.cached,
            completion_tokens: usage.completion,
          }) : Promise.resolve(),
          store.addSpend(costMicros(model, usage)),
        ]);
      },
    },
  };
}

/** What a chat-completions call reports, as the tally everything else uses. */
export function usageOf(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
} | null | undefined): TokenUsage {
  return {
    prompt: usage?.prompt_tokens ?? 0,
    cached: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completion: usage?.completion_tokens ?? 0,
  };
}

export const NO_USAGE: TokenUsage = { prompt: 0, cached: 0, completion: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { prompt: a.prompt + b.prompt, cached: a.cached + b.cached, completion: a.completion + b.completion };
}
