-- Explore 预置题库（避免运行时调用 LLM）
CREATE TABLE IF NOT EXISTS public.explore_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id TEXT NOT NULL REFERENCES public.explore_lessons(id) ON DELETE CASCADE,
  explore_term_id UUID NOT NULL REFERENCES public.explore_terms(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'fill_blank',
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.explore_questions
  ADD CONSTRAINT explore_questions_unique_item UNIQUE (lesson_id, explore_term_id, question_text);

ALTER TABLE public.explore_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read explore questions" ON public.explore_questions;
CREATE POLICY "Authenticated users can read explore questions"
ON public.explore_questions FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_explore_questions_lesson_id ON public.explore_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_explore_questions_explore_term_id ON public.explore_questions(explore_term_id);

-- 为每个 explore term 预置 1 道填空题（可后续逐步扩展为多题型）
INSERT INTO public.explore_questions (
  lesson_id,
  explore_term_id,
  question_text,
  question_type,
  options,
  correct_answer,
  explanation,
  sort_order
)
SELECT
  t.lesson_id,
  t.id,
  'Fill in the blank: ' || t.definition,
  'fill_blank',
  NULL,
  t.term,
  COALESCE(NULLIF(t.explanation, ''), 'Match the concept to the correct term.'),
  t.sort_order
FROM public.explore_terms t
ON CONFLICT DO NOTHING;
