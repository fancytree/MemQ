import { validMcqPool, validTrueFalse } from './practiceOptions.ts';

/** Validate model content, then retry once only for malformed output. */
export async function generateValidBatch(generate: (repair: boolean) => Promise<string | null>, termIds: string[]): Promise<{ questions: any[] }> {
  const ids = new Set(termIds);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generate(attempt > 0);
    let parsed: unknown;
    try { parsed = JSON.parse(raw || ''); } catch { continue; }
    const questions = (parsed as { questions?: unknown } | null)?.questions;
    if (!Array.isArray(questions) || questions.length === 0) continue;
    const covered = new Set<string>();
    const valid = questions.every(q => {
      if (!q || typeof q !== 'object' || typeof q.term_id !== 'string' || !ids.has(q.term_id) ||
          typeof q.question_text !== 'string' || !q.question_text.trim() ||
          typeof q.correct_answer !== 'string' || !q.correct_answer.trim()) return false;
      covered.add(q.term_id);
      if (q.question_type === 'mcq') return validMcqPool(q.options, q.correct_answer);
      if (q.question_type === 'true_false') return validTrueFalse(q.options, q.correct_answer, q.question_text);
      return q.question_type === 'fill_blank' && (q.options === null || q.options === undefined);
    });
    if (valid && covered.size === ids.size) return { questions };
  }
  throw new Error('Could not generate valid questions. Please try again.');
}
