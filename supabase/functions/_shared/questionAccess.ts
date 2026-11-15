import { isDirectUserSession } from './directSession.ts';

export interface QuestionSource {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
  language_data: Record<string, unknown> | null;
  content_revision: string;
}
export interface QuestionAccessClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
        in(column: string, values: string[]): PromiseLike<{ data: QuestionSource[] | null; error: unknown }>;
      };
    };
  };
}
type AccessResult = { ok: true; terms: QuestionSource[] } | { ok: false; status: number; error: string };

/** Verify the caller and read the card content and revisions from the database. */
export async function checkQuestionAccess(
  supabase: QuestionAccessClient,
  authorization: string,
  lessonId: string,
  termIds: unknown[],
): Promise<AccessResult> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || !isDirectUserSession(authorization)) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!termIds.length || termIds.some((id) => typeof id !== 'string' || !id) || new Set(termIds).size !== termIds.length) {
    return { ok: false, status: 400, error: 'Invalid card IDs' };
  }
  const { data: lesson, error: lessonError } = await supabase.from('lessons')
    .select('id').eq('id', lessonId).eq('user_id', user.id).maybeSingle();
  if (lessonError || !lesson) return { ok: false, status: 404, error: 'Lesson or cards not found' };
  const { data: ownedTerms, error: termsError } = await supabase.from('terms')
    .select('id,term,definition,explanation,language_data,content_revision').eq('lesson_id', lessonId).in('id', termIds as string[]);
  if (termsError || ownedTerms?.length !== termIds.length || ownedTerms.some((term) => !term.content_revision)) {
    return { ok: false, status: 404, error: 'Lesson or cards not found' };
  }
  return { ok: true, terms: ownedTerms };
}
