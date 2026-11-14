import { supabase } from '@/lib/supabase';
import { isCurrentPracticeQuestion } from '@/lib/practiceQuestions';

/** Prefer revision-aware questions, while supporting servers awaiting the migration. */
export async function loadCurrentPracticeQuestions(termIds: string[]) {
  const withRevision = await supabase.from('questions')
    .select('*, terms!inner(content_revision)')
    .in('term_id', termIds)
    .order('created_at', { ascending: false });
  if (!withRevision.error) {
    return { data: (withRevision.data || []).filter(isCurrentPracticeQuestion), error: null };
  }
  const error = withRevision.error;
  const missingRevision = error.code === '42703' && /(?:content_revision|source_revision)/i.test(error.message || '');
  if (!missingRevision) return { data: null, error };
  // Legacy projects do not have revision columns yet; preserve existing behavior.
  return await supabase.from('questions').select('*').in('term_id', termIds).order('created_at', { ascending: false });
}
