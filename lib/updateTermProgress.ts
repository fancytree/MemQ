import { supabase } from '@/lib/supabase';
import { cardStateFromRow, scheduleReview } from '@/lib/scheduler';
import { heldAnswers, holdAnswer, keepHeld, stillWorthSending, type HeldAnswer } from '@/lib/answerQueue';

const missingColumn = (error: { code?: string } | null) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703');

/**
 * Write one answer from the app itself: the same schedule the Edge Function would
 * have given it (lib/scheduler), the same two rows.
 *
 * `at` is when the answer was given, which is not always now: an answer held back
 * by a dead connection (lib/answerQueue) is sent later and still belongs to the day
 * it was given, both in the log and in the schedule it earns.
 *
 * A late answer never drags a card backwards. If the card has been answered again
 * since, that later answer is the one that decides where it stands and when it
 * comes round; this one is only added to the log, where the day it happened on is
 * what matters.
 */
async function writeAnswer({ termId, isCorrect, at, tzOffsetMinutes }: HeldAnswer): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return false;
  const now = new Date(at);

  const { data: current, error: readError } = await supabase
    .from('user_term_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('term_id', termId)
    .maybeSingle();
  if (readError) return false;

  const seenSince = !!current?.last_reviewed_at && Date.parse(current.last_reviewed_at) > now.getTime();

  if (!seenSince) {
    let deadline: Date | null = null;
    const { data: termData } = await supabase
      .from('terms')
      .select('lesson_id')
      .eq('id', termId)
      .maybeSingle();
    if (termData?.lesson_id) {
      const { data: lessonData } = await supabase
        .from('lessons')
        .select('deadline')
        .eq('id', termData.lesson_id)
        .maybeSingle();
      const parsed = lessonData?.deadline ? new Date(lessonData.deadline) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) deadline = parsed;
    }

    const review = scheduleReview({
      state: cardStateFromRow(current as Parameters<typeof cardStateFromRow>[0]),
      isCorrect, now, deadline, tzOffsetMinutes,
    });
    const row = {
      user_id: user.id,
      term_id: termId,
      status: review.status,
      step_index: review.stepIndex,
      last_reviewed_at: now.toISOString(),
      next_review_at: review.nextReviewAt.toISOString(),
    };
    // `ease` and `lapses` arrive with a migration; without it the answer still counts.
    const { error } = await supabase.from('user_term_progress')
      .upsert({ ...row, ease: review.ease, lapses: review.lapses }, { onConflict: 'user_id,term_id' });
    if (missingColumn(error)) {
      const { error: plain } = await supabase.from('user_term_progress').upsert(row, { onConflict: 'user_id,term_id' });
      if (plain) return false;
    } else if (error) {
      return false;
    }
  }

  // And the answer itself, the same row the Edge Function adds (review_events).
  const { error: logError } = await supabase.from('review_events')
    .insert({ user_id: user.id, term_id: termId, is_correct: isCorrect, reviewed_at: now.toISOString() });
  return !logError;
}

/**
 * Record one answer. The Edge Function does it; if it cannot be reached the app does
 * the same thing itself, with the same schedule (lib/scheduler), so an answer given
 * on a bad connection is scheduled no differently from one given on a good one.
 *
 * And if neither can be reached — no signal at all, or a session that has just
 * expired — the answer is held on the device rather than dropped, and goes up with
 * the next one that gets through or when the app is next opened (lib/answerQueue).
 */
export async function updateTermProgressSafe(termId: string, isCorrect: boolean): Promise<void> {
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const answer: HeldAnswer = { termId, isCorrect, at: new Date().toISOString(), tzOffsetMinutes };
  try {
    const { error } = await supabase.functions.invoke('update-term-progress', {
      body: { term_id: termId, is_correct: isCorrect, tz_offset_minutes: tzOffsetMinutes },
    });
    if (!error) { void sendHeldAnswers(); return; }
  } catch {
    // fallback
  }

  try {
    if (await writeAnswer(answer)) { void sendHeldAnswers(); return; }
  } catch {
    // held below
  }
  await holdAnswer(answer);
}

/** Send what is waiting, oldest first; stop at the first one that will not go. */
export async function sendHeldAnswers(): Promise<number> {
  const waiting = await heldAnswers();
  if (waiting.length === 0) return 0;
  const now = new Date();
  const left = waiting.filter((answer) => stillWorthSending(answer, now));
  let sent = 0;
  while (left.length > 0) {
    try {
      if (!await writeAnswer(left[0])) break;
    } catch {
      break;
    }
    left.shift();
    sent += 1;
  }
  if (sent > 0 || left.length !== waiting.length) await keepHeld(left);
  return sent;
}
