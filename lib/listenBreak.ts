/**
 * A while without being asked to listen.
 *
 * "Can't listen now" used to trade the one question in front of you and nothing
 * more, so on a bus, in a meeting, or with someone asleep next door you pressed it
 * again on the next card, and the one after that. What a person means by it is
 * almost never "this card": it is "not for a while".
 *
 * So it asks for how long and keeps the answer here, on the device, next to the
 * practice settings and for the same reasons — it is about this person and this
 * phone, it has to be known before the first question is picked, and a round
 * should not wait on the network to find out what it may ask.
 *
 * It is a moment in time rather than a countdown, so it survives the app being
 * closed and the round being left: come back inside the hour and the hour is still
 * running; come back tomorrow and it has simply passed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'memq.listenBreak.v1';

/** How long the break can be.
 *
 *  The words are the chip labels, and the three chips take an equal third of the
 *  dialog's width each, so a label has about ten characters before it is cut.
 *  "Rest of today" was thirteen and came out as "Rest of to…"; under a question
 *  that already asks how long, "Today" is the same answer and fits. */
export const LISTEN_BREAK_CHOICES = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: 'Today', minutes: null },
] as const;

export type ListenBreakChoice = typeof LISTEN_BREAK_CHOICES[number];

/** When a break of this length, started now, runs out.
 *
 * "Today" is the next midnight rather than a number of hours: a person
 * choosing it at nine in the morning and one choosing it at eleven at night both
 * mean "today", and a fixed span would give them very different days.
 */
export function listenBreakEnd(choice: ListenBreakChoice, now: Date = new Date()): number {
  if (choice.minutes !== null) return now.getTime() + choice.minutes * 60000;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

/** Still running? A break that has passed is the same as no break at all. */
export function listenBreakActive(until: number | null, now: Date = new Date()): boolean {
  return until !== null && until > now.getTime();
}

/** What is left of the break, in the words a screen can show. Null once it has
 *  passed, so a screen with nothing to say says nothing. */
export function listenBreakLeft(until: number | null, now: Date = new Date()): string | null {
  if (!listenBreakActive(until, now)) return null;
  const minutes = Math.ceil((until! - now.getTime()) / 60000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour left' : `${hours} hours left`;
}

export async function loadListenBreak(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const until = Number(raw);
    return Number.isFinite(until) ? until : null;
  } catch {
    return null;
  }
}

export async function saveListenBreak(until: number): Promise<void> {
  try { await AsyncStorage.setItem(KEY, String(until)); } catch { /* a preference, not data */ }
}

export async function clearListenBreak(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* a preference, not data */ }
}
