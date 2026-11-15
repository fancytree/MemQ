import { supabase } from '@/lib/supabase';
import type { DayKey, ReviewDay } from '@/lib/reviewStats';

/** Answers per local day since `since`, counted by the database (review_days). Null
 * when the record is not there to read — before its migration has run — so a chart
 * can tell "nothing yet" from "nothing on these days". */
export async function loadReviewDays(since: Date): Promise<Map<DayKey, ReviewDay> | null> {
  const { data, error } = await supabase.rpc('review_days', {
    since: since.toISOString(),
    tz_offset_minutes: -new Date().getTimezoneOffset(),
  });
  if (error) return null;
  const days = new Map<DayKey, ReviewDay>();
  for (const row of (data ?? []) as { day: string; answers: number; correct: number; cards: number }[]) {
    days.set(row.day, { answers: row.answers, correct: row.correct, cards: row.cards });
  }
  return days;
}
