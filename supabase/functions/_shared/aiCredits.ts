/**
 * One allowance for everything a person asks an AI to do.
 *
 * There were seven: generated lessons by the month, auto-filled cards by the
 * day, PDFs for ever, and two kinds of chat message with a quota each. Every one
 * was a sensible ceiling and none could be explained — nobody can hold "five of
 * these a month, thirty of those a day and three of the other, ever" in their
 * head, and the app could only show what was left of one of them.
 *
 * So there is one number. Anything a person *chooses* to ask for spends from it:
 * a message, a card rewritten, a set of cards, a PDF. It comes back on the first
 * of the month. What each costs is roughly what it costs us, in whole numbers
 * small enough to remember.
 *
 * What the app does on its own account — writing practice questions, marking a
 * typed answer — is not on it. Those are the lesson itself; being stopped in the
 * middle of practising to be told about an allowance is the wrong moment and the
 * wrong thing to charge for. They keep their own ceilings (aiGate.ts), set where
 * no person meets them.
 *
 * `lib/aiCredits.ts` is the app's copy of the numbers here, for drawing what is
 * left. The app cannot import this file, so the two are kept in step by a test
 * (tests/aiCredits.test.mjs) that reads both.
 *
 * No imports: the rules are values and arithmetic.
 */

/** What a month allows. Pro is a number too, and the app says it: "unlimited"
 *  would be a promise the day's budget could break. */
export const CREDIT_LIMIT = { free: 50, pro: 2000 } as const;

/** What each thing costs, by the name its use is filed under in `ai_usage`. */
export const CREDIT_COST: Readonly<Record<string, number>> = {
  /** A message on either chat line. */
  ai_chat_create: 1,
  ai_chat: 1,
  /** One card written or rewritten from its term. */
  card_fill: 1,
  /** A set of cards from a topic or a passage. */
  lesson_generate: 3,
  /** A PDF read. The dear one: it is priced by the page by someone else. */
  pdf_process: 10,
};

export const CREDIT_FEATURES: readonly string[] = Object.keys(CREDIT_COST);

/** The first instant of the month, in UTC so it does not move with the caller. */
export function creditPeriodStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** When the allowance comes back. */
export function creditReset(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * What has been spent, from how many times each thing was used this month.
 * Null if any count could not be read: a failed query must not hand out
 * capacity, so the caller treats null as everything spent.
 */
export function creditsSpent(counts: Readonly<Record<string, number | null | undefined>>): number | null {
  let spent = 0;
  for (const feature of CREDIT_FEATURES) {
    const count = counts[feature];
    if (typeof count !== 'number' || !Number.isFinite(count)) return null;
    spent += Math.max(0, count) * CREDIT_COST[feature];
  }
  return spent;
}

export type CreditVerdict =
  | { allowed: true; limit: number; used: number; left: number }
  | { allowed: false; limit: number; used: number; left: number; cost: number };

/** Whether something costing `cost` may go ahead. It has to fit: ten for a PDF
 *  is not allowed on the strength of four that are left. */
export function creditVerdict(input: { isPro: boolean; spent: number | null; cost: number }): CreditVerdict {
  const limit = input.isPro ? CREDIT_LIMIT.pro : CREDIT_LIMIT.free;
  const used = Math.min(limit, input.spent ?? limit);
  const left = limit - used;
  return left >= input.cost
    ? { allowed: true, limit, used, left }
    : { allowed: false, limit, used, left, cost: input.cost };
}

/** What someone who has run out is told. Something they can act on, and when it
 *  ends; a paying account is told only that it is too much, since there is
 *  nothing to sell them. */
export function creditRefusal(verdict: Extract<CreditVerdict, { allowed: false }>, isPro: boolean): string {
  if (isPro) return 'That is more than this account can use this month. It will be back on the 1st.';
  if (verdict.left > 0) {
    return `That takes ${verdict.cost} AI credits and you have ${verdict.left} left this month. They come back on the 1st.`;
  }
  return 'You have used this month’s AI credits. They come back on the 1st — and making cards with your own AI is always free.';
}
