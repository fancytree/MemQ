import { compatibleAnswerScripts } from './quizLanguage.ts';

/** A saved question may predate current authoring limits, so validate data at the boundary. */
export type SavedPracticeQuestion = {
  term_id: string;
  question_text: string;
  question_type: string;
  options: unknown;
  correct_answer: string;
  explanation: string | null;
};
export type UsablePracticeQuestion =
  | { mode: 'mcq'; q: string; opts: string[]; correct: number; explain?: string }
  | { mode: 'recall'; q: string; answer: string; explain?: string };

export function chooseSavedQuestion(rows: SavedPracticeQuestion[], stage: 'mcq' | 'recall', random: () => number = Math.random): UsablePracticeQuestion | null {
  const usable: UsablePracticeQuestion[] = [];
  for (const row of rows) {
    if (typeof row.question_text !== 'string' || typeof row.correct_answer !== 'string') continue;
    const q = row.question_text.trim();
    const answer = row.correct_answer.trim();
    if (!q || !answer) continue;
    const explain = typeof row.explanation === 'string' ? row.explanation.trim() || undefined : undefined;
    if (stage === 'recall' && row.question_type === 'fill_blank') {
      usable.push({ mode: 'recall', q, answer, explain });
    } else if (stage === 'mcq' && (row.question_type === 'mcq' || row.question_type === 'true_false')) {
      const minimum = row.question_type === 'mcq' ? 4 : 2;
      const maximum = row.question_type === 'mcq' ? 6 : 2;
      if (!Array.isArray(row.options) || row.options.length < minimum || row.options.length > maximum || row.options.some((value) => typeof value !== 'string' || !value.trim())) continue;
      const storedOptions = row.options.map((value: string) => value.trim());
      if (row.question_type === 'mcq' && !compatibleAnswerScripts(answer, storedOptions)) continue;
      if (new Set(storedOptions.map((value: string) => value.toLocaleLowerCase())).size !== storedOptions.length) continue;
      const storedCorrect = storedOptions.indexOf(answer);
      if (storedCorrect < 0 || storedOptions.indexOf(answer, storedCorrect + 1) >= 0) continue;
      if (row.question_type === 'true_false') {
        if (!compatibleAnswerScripts(q, storedOptions)) continue;
        usable.push({ mode: 'mcq', q, opts: storedOptions, correct: storedCorrect, explain });
        continue;
      }
      const distractors = storedOptions.filter((_, index) => index !== storedCorrect);
      for (let i = distractors.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
        [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
      }
      const opts = [answer, ...distractors.slice(0, 3)];
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      usable.push({ mode: 'mcq', q, opts, correct: opts.indexOf(answer), explain });
    }
  }
  return usable.length ? usable[Math.min(usable.length - 1, Math.floor(Math.max(0, random()) * usable.length))] : null;
}

/** Compare source and card revisions returned in the same database query. */
export function isCurrentPracticeQuestion(row: { source_revision?: unknown; terms?: unknown }): boolean {
  const term = Array.isArray(row.terms) ? row.terms[0] : row.terms;
  if (!term || typeof term !== 'object') return false;
  const revision = (term as { content_revision?: unknown }).content_revision;
  return typeof revision === 'string' && typeof row.source_revision === 'string' && row.source_revision === revision;
}
