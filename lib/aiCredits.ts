/**
 * The month's AI credits, as the app shows them.
 *
 * The rule itself lives on the server (supabase/functions/_shared/aiCredits.ts):
 * every function that calls a model counts and refuses for itself. The numbers
 * are repeated here because the app cannot import that file, and they are only
 * ever used to draw — how many are left, what a thing costs — so the screen can
 * say so before a button is pressed. A test reads both files and fails when they
 * disagree (tests/aiCredits.test.mjs); when they do anyway, the server is right.
 *
 * No imports, so it runs in a test with no app around it.
 */

export const CREDIT_LIMIT = { free: 50, pro: 2000 } as const;

/** What each thing costs, by the name its use is filed under. */
export const CREDIT_COST: Readonly<Record<string, number>> = {
  ai_chat_create: 1,
  ai_chat: 1,
  card_fill: 1,
  lesson_generate: 3,
  pdf_process: 10,
};

export const CREDIT_FEATURES: readonly string[] = Object.keys(CREDIT_COST);

/** Below this share of the month's allowance, the app starts saying what is
 *  left where it otherwise would not, and offers Pro beside it. */
export const CREDIT_LOW_SHARE = 0.2;

export function creditPeriodStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function creditsSpent(counts: Readonly<Record<string, number | null | undefined>>): number | null {
  let spent = 0;
  for (const feature of CREDIT_FEATURES) {
    const count = counts[feature];
    if (typeof count !== 'number' || !Number.isFinite(count)) return null;
    spent += Math.max(0, count) * CREDIT_COST[feature];
  }
  return spent;
}

export type Credits = {
  isPro: boolean;
  limit: number;
  used: number;
  left: number;
  /** Little enough left to be worth mentioning. */
  low: boolean;
  out: boolean;
  /** When the allowance comes back, as a date to print: "Dec 1". */
  resets: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function creditState(spent: number, isPro: boolean, now: Date = new Date()): Credits {
  const limit = isPro ? CREDIT_LIMIT.pro : CREDIT_LIMIT.free;
  const used = Math.min(limit, Math.max(0, spent));
  const left = limit - used;
  return {
    isPro, limit, used, left,
    low: left <= limit * CREDIT_LOW_SHARE,
    out: left <= 0,
    // The month after this one, in UTC like the count itself.
    resets: `${MONTHS[(now.getUTCMonth() + 1) % 12]} 1`,
  };
}

/** Whether there is enough for something. Unknown counts as enough: the button
 *  stays live and the server decides. */
export function canAfford(credits: Credits | null, feature: string): boolean {
  return !credits || credits.left >= (CREDIT_COST[feature] ?? 1);
}

/** The one line that says where they stand. */
export function creditsLabel(credits: Credits): string {
  if (credits.out) return `No AI credits left · back ${credits.resets}`;
  return `${credits.left} AI ${credits.left === 1 ? 'credit' : 'credits'} left this month`;
}

/** What credits are, for the person who taps the line to find out. Short: four
 *  prices and the two facts that matter. */
export function creditGuide(credits: Credits): string {
  return [
    'A chat message or a rewritten card uses 1. A set of cards uses 3. A PDF uses 10.',
    `You get ${credits.limit.toLocaleString('en-US')} a month${credits.isPro ? ' with Pro' : `, or ${CREDIT_LIMIT.pro.toLocaleString('en-US')} with Pro`}. They come back on ${credits.resets}.`,
    'Practising, and making cards with your own AI, never use any.',
  ].join('\n\n');
}
