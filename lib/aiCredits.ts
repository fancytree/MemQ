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

/* ── The record of what was used ───────────────────────────────────────────────
 * For the credits page (app/credits.tsx): each use this month, newest first, in
 * words a person would use for it and with what it took. */

/** What each use is called on the page. */
export const CREDIT_NAME: Readonly<Record<string, string>> = {
  ai_chat_create: 'Chat message',
  ai_chat: 'Chat message',
  card_fill: 'Card written',
  lesson_generate: 'Set of cards',
  pdf_process: 'PDF read',
};

/** What everything costs, for the page that explains it: one line each, the
 *  two chat lines being one thing to the person. */
export const CREDIT_PRICES: readonly { name: string; cost: number }[] = [
  { name: 'A chat message', cost: CREDIT_COST.ai_chat },
  { name: 'A card written or rewritten', cost: CREDIT_COST.card_fill },
  { name: 'A set of cards', cost: CREDIT_COST.lesson_generate },
  { name: 'A PDF', cost: CREDIT_COST.pdf_process },
];

export type CreditUse = { id: string; feature: string; created_at: string };
export type CreditEntry = { id: string; name: string; cost: number; when: string };

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * The record, newest first: what each use was, what it took, and when — as the
 * person's own clock has it. "Today 6:20 PM", "Yesterday 3:14 PM", and before
 * that the date, "Nov 3 11:59 PM".
 *
 * One list, with the day written on each line. It was grouped under a heading
 * for each day, which put a small label ("Today") under another small label
 * ("Used this month") and made the first thing in the list a heading for one
 * row. Rows for anything that costs nothing, or with a time that cannot be
 * read, are left out.
 */
export function creditHistory(rows: readonly CreditUse[], now: Date = new Date()): CreditEntry[] {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return [...rows]
    .filter((row) => row.feature in CREDIT_COST && !Number.isNaN(Date.parse(row.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row) => {
      const at = new Date(row.created_at);
      const day = sameDay(at, now) ? 'Today' : sameDay(at, yesterday) ? 'Yesterday' : `${MONTHS[at.getMonth()]} ${at.getDate()}`;
      const hour = at.getHours() % 12 || 12;
      const time = `${hour}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'AM' : 'PM'}`;
      return { id: row.id, name: CREDIT_NAME[row.feature], cost: CREDIT_COST[row.feature], when: `${day} ${time}` };
    });
}
