import { STAGES, type Stage } from './scheduler.ts';
import { toLocalDateKey } from './streak.ts';

/** The numbers behind the charts on the You page.
 *
 * Two kinds, and they are kept apart because they are not equally true:
 *
 * - Where every card stands now, and when each is due next, come from
 *   user_term_progress and are exact for every card, from the first day.
 * - How much was studied on a day, and how much of it was right, come from
 *   review_events, which records each answer from the day it went live. Before that
 *   there is nothing to count, and the charts say so rather than inventing a past.
 */

export type DayKey = string; // YYYY-MM-DD, local

/** Cards per stage. A card with no progress yet has not been studied: New. */
export function stageCounts(termIds: string[], statusOf: Map<string, string | null>): Record<Stage, number> {
  const counts = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  for (const id of termIds) {
    const status = statusOf.get(id);
    const stage = (STAGES as readonly string[]).includes(status ?? '') ? status as Stage : 'New';
    counts[stage] += 1;
  }
  return counts;
}

/** Midnight, local, `offset` days from today. */
export function dayStart(offset: number, now = new Date()): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + offset);
  return day;
}

/** Cards coming due on each of the next `days` days, today first. Anything already
 * overdue is due today: that is when it will be asked for. A card that has never
 * been studied has no date and is not in the forecast — it is waiting to be started,
 * not to be reviewed. */
export function dueForecast(nextReviews: (string | null)[], days = 7, now = new Date()): number[] {
  const counts = new Array<number>(days).fill(0);
  const starts = Array.from({ length: days + 1 }, (_, i) => dayStart(i, now).getTime());
  for (const at of nextReviews) {
    if (!at) continue;
    const t = new Date(at).getTime();
    if (Number.isNaN(t) || t >= starts[days]) continue;
    let i = 0;
    while (i < days - 1 && t >= starts[i + 1]) i += 1;
    counts[i] += 1;
  }
  return counts;
}

export type ReviewDay = { answers: number; correct: number; cards: number };

/** The local day keys from `count` days ago up to today, oldest first. */
export function recentDays(count: number, now = new Date()): DayKey[] {
  return Array.from({ length: count }, (_, i) => toLocalDateKey(dayStart(i - count + 1, now)));
}

/** Cards whose latest review fell on each day. It undercounts — a card studied on
 * Monday and again on Wednesday is only Wednesday's — but it is the only measure of
 * how much was studied on a day from before review_events began. */
export function cardsByLastReview(lastReviews: (string | null | undefined)[]): Map<DayKey, number> {
  const counts = new Map<DayKey, number>();
  for (const at of lastReviews) {
    if (!at) continue;
    const key = toLocalDateKey(at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** A shade (0–4) for each day: the cards studied that day against the busiest day
 * in `keys`. Where the review record has a day it is used, since it counts every
 * card; otherwise the cards last reviewed that day stand in for it. Any study at all
 * is at least the first shade, so a light day is never mistaken for an empty one. */
export function studyLevels(
  keys: DayKey[], recorded: Map<DayKey, ReviewDay> | null, lastReviewed: Map<DayKey, number>,
): Map<DayKey, number> {
  const cards = keys.map((key) => recorded?.get(key)?.cards || lastReviewed.get(key) || 0);
  const busiest = Math.max(1, ...cards);
  return new Map(keys.map((key, i) => [key,
    cards[i] === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((cards[i] / busiest) * 4)))]));
}
