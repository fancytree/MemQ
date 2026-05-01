import { supabase } from '@/lib/supabase';

const STAGES = ['New', 'Learning', 'Familiar', 'Good', 'Strong', 'Mastered'] as const;
type LearningStage = (typeof STAGES)[number];

const getReviewIntervalDays = (stepIndex: number): number => {
  const intervals: Record<number, number> = {
    0: 1,
    1: 3,
    2: 7,
    3: 14,
    4: 30,
    5: 90,
  };
  return intervals[stepIndex] ?? 1;
};

export async function updateTermProgressSafe(termId: string, isCorrect: boolean): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('update-term-progress', {
      body: { term_id: termId, is_correct: isCorrect },
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
      .select('step_index')
      .eq('user_id', user.id)
      .eq('term_id', termId)
      .maybeSingle();

    const currentIndex = typeof current?.step_index === 'number' ? current.step_index : 0;
    const now = new Date();

    let newIndex = isCorrect ? Math.min(currentIndex + 1, 5) : 1;
    let intervalDays = isCorrect ? getReviewIntervalDays(newIndex) : 0;

    const { data: termData } = await supabase
      .from('terms')
      .select('lesson_id')
      .eq('id', termId)
      .maybeSingle();

    if (isCorrect && termData?.lesson_id) {
      const { data: lessonData } = await supabase
        .from('lessons')
        .select('deadline')
        .eq('id', termData.lesson_id)
        .maybeSingle();

      if (lessonData?.deadline) {
        const deadline = new Date(lessonData.deadline);
        if (!Number.isNaN(deadline.getTime()) && deadline > now) {
          const daysUntilDeadline = Math.ceil(
            (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
          const stagesRemaining = Math.max(1, 5 - newIndex);
          const maxAllowedInterval = daysUntilDeadline / stagesRemaining;
          intervalDays = Math.max(1, Math.ceil(Math.min(intervalDays, maxAllowedInterval)));
        }
      }
    }

    const nextReviewAt = new Date(now);
    if (isCorrect) {
      nextReviewAt.setDate(nextReviewAt.getDate() + Math.max(1, intervalDays));
    }

    const status = STAGES[newIndex] as LearningStage;
    await supabase.from('user_term_progress').upsert(
      {
        user_id: user.id,
        term_id: termId,
        status,
        step_index: newIndex,
        last_reviewed_at: now.toISOString(),
        next_review_at: nextReviewAt.toISOString(),
      },
      { onConflict: 'user_id,term_id' },
    );
  } catch {
    // ignore
  }
}
