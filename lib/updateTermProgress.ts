import { supabase } from '@/lib/supabase';
import { cardStateFromRow, scheduleReview } from '@/lib/scheduler';

const missingColumn = (error: { code?: string } | null) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703');

/**
 * Record one answer. The Edge Function does it; if it cannot be reached the app does
 * the same thing itself, with the same schedule (lib/scheduler), so an answer given
 * on a bad connection is scheduled no differently from one given on a good one.
 */
export async function updateTermProgressSafe(termId: string, isCorrect: boolean): Promise<void> {
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  try {
    const { error } = await supabase.functions.invoke('update-term-progress', {
      body: { term_id: termId, is_correct: isCorrect, tz_offset_minutes: tzOffsetMinutes },
    });
    if (!error) return;
  } catch {
    // fallback
  }

  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;

    const { data: current } = await supabase
      .from('user_term_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('term_id', termId)
      .maybeSingle();

    const now = new Date();
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
      await supabase.from('user_term_progress').upsert(row, { onConflict: 'user_id,term_id' });
    }
    // And the answer itself, the same row the Edge Function adds (review_events).
    await supabase.from('review_events')
      .insert({ user_id: user.id, term_id: termId, is_correct: isCorrect, reviewed_at: now.toISOString() });
  } catch {
    // ignore
  }
}
