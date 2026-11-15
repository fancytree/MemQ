/**
 * When a card comes back.
 *
 * This is the one place the schedule is written down. The Edge Function that records
 * an answer and the app's own fallback both call it, so a card is never scheduled two
 * different ways. It is plain TypeScript with no imports: it runs under Deno and
 * under Metro alike.
 *
 * The rules, in the order they matter:
 *
 * 1. A stage is earned by a *spaced* retrieval. Answering a card that is not yet due
 *    — the second and third question on it inside one round, or extra practice the
 *    day before it comes back — is practice, and practice does not move the card. It
 *    used to: three right answers in one sitting carried a new card three stages and
 *    put it away for a fortnight.
 * 2. The waits expand: a day, three, a week, a fortnight, a month, then doubling. The
 *    first return is the one that matters most, so it is a day and not three.
 * 3. A card that keeps being missed comes back sooner than one that never is (ease).
 * 4. A miss is one step back and a second look in ten minutes. Missing it again in
 *    the same sitting does not take a second step.
 * 5. A deadline bends the waits to fit. The remaining waits keep their shape — each
 *    longer than the last — and are scaled down together so the last stage lands
 *    before the day, and nothing is scheduled past the day without one last look the
 *    day before.
 */

export const STAGES = ['New', 'Learning', 'Familiar', 'Good', 'Strong', 'Mastered'] as const;
export type Stage = (typeof STAGES)[number];

/** Days to wait after arriving at each stage. A card at New is not waiting for anything. */
export const STAGE_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_STAGE = STAGES.length - 1;
export const MAX_INTERVAL_DAYS = 180;
/** How soon a missed card is looked at again. */
export const RELEARN_MINUTES = 10;
/** The shortest wait a deadline can squeeze a card down to. */
export const MIN_CRAM_DAYS = 4 / 24;
export const DEFAULT_EASE = 1;
export const MIN_EASE = 0.6;
export const MAX_EASE = 1.3;
/** The hour, local time, a study day starts. Someone up past midnight is still on yesterday. */
const DAY_STARTS_AT_HOUR = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type CardState = {
  stepIndex: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  ease: number;
  lapses: number;
};

export type ReviewOutcome =
  /** A spaced retrieval: the card moved up a stage. */
  | 'promoted'
  /** Right, but not yet due: practice. The schedule stands. */
  | 'held'
  /** Wrong: one stage back, and back in ten minutes. */
  | 'lapsed'
  /** Wrong again while already being relearned: no second step back. */
  | 'relearning';

export type ReviewResult = {
  stepIndex: number;
  status: Stage;
  nextReviewAt: Date;
  ease: number;
  lapses: number;
  outcome: ReviewOutcome;
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const validDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Read a stored row, whatever columns the database has so far. */
export function cardStateFromRow(row: {
  step_index?: number | null;
  next_review_at?: string | Date | null;
  last_reviewed_at?: string | Date | null;
  ease?: number | null;
  lapses?: number | null;
} | null | undefined): CardState | null {
  if (!row) return null;
  const step = typeof row.step_index === 'number' && Number.isFinite(row.step_index) ? row.step_index : 0;
  return {
    stepIndex: clamp(Math.round(step), 0, MAX_STAGE),
    nextReviewAt: validDate(row.next_review_at),
    lastReviewedAt: validDate(row.last_reviewed_at),
    ease: typeof row.ease === 'number' && Number.isFinite(row.ease) ? clamp(row.ease, MIN_EASE, MAX_EASE) : DEFAULT_EASE,
    lapses: typeof row.lapses === 'number' && Number.isFinite(row.lapses) ? Math.max(0, Math.round(row.lapses)) : 0,
  };
}

/** A card with no history, or whose time has come. */
export function isDue(state: CardState | null, now: Date): boolean {
  if (!state || !state.lastReviewedAt || !state.nextReviewAt) return true;
  return state.nextReviewAt.getTime() <= now.getTime();
}

/** Missed a moment ago and waiting out its ten minutes. */
function isRelearning(state: CardState, now: Date): boolean {
  if (!state.lastReviewedAt || !state.nextReviewAt) return false;
  const wait = state.nextReviewAt.getTime() - state.lastReviewedAt.getTime();
  const since = now.getTime() - state.lastReviewedAt.getTime();
  return wait >= 0 && wait <= (RELEARN_MINUTES + 1) * MINUTE_MS && since >= 0 && since < 60 * MINUTE_MS;
}

/** How long before the day the last look is scheduled. */
const finalReviewLead = (daysLeft: number) => (daysLeft >= 3 ? 1 : daysLeft / 3);

/**
 * Bend a wait to fit a deadline.
 *
 * `stage` is where the card has just arrived. The waits still ahead of it on the
 * ordinary path are this one and every later stage's; if together they overrun the
 * time left, all of them shrink by the same factor, which is how the schedule stays
 * an expanding one instead of becoming equal slices.
 */
export function fitToDeadline(
  intervalDays: number, stage: number, now: Date, deadline: Date | null | undefined, ease = DEFAULT_EASE,
): number {
  if (!deadline) return intervalDays;
  const daysLeft = (deadline.getTime() - now.getTime()) / DAY_MS;
  if (!Number.isFinite(daysLeft) || daysLeft <= 0) return intervalDays;

  const lead = finalReviewLead(daysLeft);
  const budget = Math.max(0, daysLeft - lead);
  let fitted = intervalDays;

  if (stage < MAX_STAGE) {
    let path = 0;
    for (let i = Math.max(1, stage); i < MAX_STAGE; i++) path += STAGE_INTERVAL_DAYS[i] * ease;
    if (path > budget) fitted = Math.max(MIN_CRAM_DAYS, (intervalDays * budget) / path);
  }
  // Nothing sails past the day unseen, unless the day is too close to fit a look in.
  if (fitted > budget && budget >= MIN_CRAM_DAYS) fitted = budget;
  return fitted;
}

/**
 * Turn a wait into a moment.
 *
 * A wait of a day or more is a wait until a *day*, not until a time of day: a card
 * answered at nine in the evening and due tomorrow is due when tomorrow is opened,
 * not at nine in the evening again. Without the person's offset from UTC there is no
 * way to know where their day starts, and the wait is counted in hours as before.
 */
export function dueMoment(now: Date, intervalDays: number, tzOffsetMinutes?: number | null): Date {
  if (intervalDays < 1 || typeof tzOffsetMinutes !== 'number' || !Number.isFinite(tzOffsetMinutes)) {
    return new Date(now.getTime() + intervalDays * DAY_MS);
  }
  const shift = tzOffsetMinutes * MINUTE_MS - DAY_STARTS_AT_HOUR * 60 * MINUTE_MS;
  const studyDay = Math.floor((now.getTime() + shift) / DAY_MS);
  let due = (studyDay + Math.round(intervalDays)) * DAY_MS - shift;
  // Answered in the small hours, just before the day turns: tomorrow, not in an hour.
  if (due - now.getTime() < 2 * 60 * MINUTE_MS) due += DAY_MS;
  return new Date(due);
}

export function scheduleReview(input: {
  state: CardState | null;
  isCorrect: boolean;
  now: Date;
  deadline?: Date | null;
  /** Minutes east of UTC, i.e. `-new Date().getTimezoneOffset()`. */
  tzOffsetMinutes?: number | null;
}): ReviewResult {
  const { isCorrect, now, deadline, tzOffsetMinutes } = input;
  const state: CardState = input.state ?? {
    stepIndex: 0, nextReviewAt: null, lastReviewedAt: null, ease: DEFAULT_EASE, lapses: 0,
  };
  const at = (stepIndex: number, nextReviewAt: Date, ease: number, lapses: number, outcome: ReviewOutcome): ReviewResult =>
    ({ stepIndex, status: STAGES[stepIndex], nextReviewAt, ease, lapses, outcome });
  const soon = new Date(now.getTime() + RELEARN_MINUTES * MINUTE_MS);

  if (!isCorrect) {
    if (isRelearning(state, now)) return at(state.stepIndex, soon, state.ease, state.lapses, 'relearning');
    // Fumbling a card on the day it is met is learning, not forgetting: it costs the
    // stage it had just been given and nothing else.
    const forgotten = state.stepIndex >= 2;
    return at(
      Math.max(0, state.stepIndex - 1), soon,
      forgotten ? Math.max(MIN_EASE, state.ease * 0.85) : state.ease,
      forgotten ? state.lapses + 1 : state.lapses,
      'lapsed',
    );
  }

  if (!isDue(input.state, now)) {
    return at(state.stepIndex, state.nextReviewAt ?? soon, state.ease, state.lapses, 'held');
  }

  const stepIndex = Math.min(MAX_STAGE, state.stepIndex + 1);
  const ease = Math.min(MAX_EASE, state.ease + 0.03);
  const scheduledDays = state.lastReviewedAt && state.nextReviewAt
    ? (state.nextReviewAt.getTime() - state.lastReviewedAt.getTime()) / DAY_MS : 0;

  // A card already at the top keeps doubling from the wait it last sat through.
  let interval = state.stepIndex >= MAX_STAGE
    ? clamp(scheduledDays * 2, STAGE_INTERVAL_DAYS[MAX_STAGE], MAX_INTERVAL_DAYS)
    : STAGE_INTERVAL_DAYS[stepIndex];
  interval *= ease;
  // Remembered well past its date: the memory is stronger than the schedule assumed.
  if (scheduledDays >= 1 && state.nextReviewAt) {
    const lateDays = (now.getTime() - state.nextReviewAt.getTime()) / DAY_MS;
    if (lateDays > 0) interval *= 1 + Math.min(0.5, (lateDays / scheduledDays) * 0.25);
  }
  interval = fitToDeadline(Math.min(interval, MAX_INTERVAL_DAYS), stepIndex, now, deadline, ease);

  return at(stepIndex, dueMoment(now, interval, tzOffsetMinutes), ease, state.lapses, 'promoted');
}
