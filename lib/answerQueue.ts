/**
 * Answers that could not be saved, kept until they can be.
 *
 * Saving an answer needs the network twice over: the Edge Function first, and the
 * app's own copy of the same work as a fallback, which still has to read the card
 * and write the row. On a train, in a lift, on a phone whose session has just
 * expired, both fail — and what happened then was nothing at all. The round went
 * on, the cards looked answered, and when the app was next opened they were still
 * due, the day was missing from the streak, and the person had no way of knowing
 * any of it. A whole session on a bad connection evaporated in silence.
 *
 * So an answer that cannot be sent is written here instead, with the moment it was
 * given, and goes up with the next one that gets through or the next time the app
 * is opened. The time travels with it: a card answered on Tuesday counts for
 * Tuesday even when it arrives on Wednesday, which is the whole point for the
 * streak and for the schedule it should have been given.
 *
 * Kept small on purpose. An answer nobody could send for a fortnight is of no use
 * to the schedule any more, and a queue that grows without end on a phone that
 * never reconnects is a leak, not a safety net.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'memq.answerQueue.v1';

/** One answer, as it was given. */
export type HeldAnswer = {
  termId: string;
  isCorrect: boolean;
  /** When it was answered, ISO. The day it counts for. */
  at: string;
  /** The phone's offset then, so the schedule lands on the right local day. */
  tzOffsetMinutes: number;
};

/** How many answers are worth holding: a long round on a dead connection, twice. */
export const QUEUE_MAX = 200;
/** After this long an answer is history, not a review that is still waiting. */
export const QUEUE_DAYS = 14;

/** The answers worth keeping, oldest first, newest kept when it overflows. */
export function heldAfter(held: HeldAnswer[], answer: HeldAnswer, now: Date = new Date()): HeldAnswer[] {
  const fresh = [...held, answer].filter((item) => stillWorthSending(item, now));
  return fresh.slice(-QUEUE_MAX);
}

/** An answer still young enough to be worth sending. */
export function stillWorthSending(answer: HeldAnswer, now: Date = new Date()): boolean {
  const at = Date.parse(answer.at);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= QUEUE_DAYS * 86400000;
}

/** What is waiting, oldest first. A queue that cannot be read is an empty one. */
export async function heldAnswers(): Promise<HeldAnswer[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HeldAnswer => !!item
      && typeof item.termId === 'string' && typeof item.isCorrect === 'boolean'
      && typeof item.at === 'string' && typeof item.tzOffsetMinutes === 'number');
  } catch {
    return [];
  }
}

export async function holdAnswer(answer: HeldAnswer): Promise<void> {
  try {
    const next = heldAfter(await heldAnswers(), answer);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A phone that cannot write to its own storage is past saving the answer.
  }
}

export async function keepHeld(answers: HeldAnswer[]): Promise<void> {
  try {
    if (answers.length === 0) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // ignore
  }
}
