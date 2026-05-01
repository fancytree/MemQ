ALTER TABLE public.explore_lessons
  ADD COLUMN IF NOT EXISTS source_lesson_id UUID,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.explore_terms
  ADD COLUMN IF NOT EXISTS source_term_id UUID;

ALTER TABLE public.explore_questions
  ADD COLUMN IF NOT EXISTS source_question_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_explore_lessons_source_lesson_id_unique
  ON public.explore_lessons(source_lesson_id)
  WHERE source_lesson_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_explore_terms_source_term_unique
  ON public.explore_terms(lesson_id, source_term_id)
  WHERE source_term_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_explore_questions_source_question_unique
  ON public.explore_questions(lesson_id, source_question_id)
  WHERE source_question_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can insert their published explore lessons" ON public.explore_lessons;
CREATE POLICY "Users can insert their published explore lessons"
ON public.explore_lessons FOR INSERT
TO authenticated
WITH CHECK (published_by = auth.uid());

DROP POLICY IF EXISTS "Users can update their published explore lessons" ON public.explore_lessons;
CREATE POLICY "Users can update their published explore lessons"
ON public.explore_lessons FOR UPDATE
TO authenticated
USING (published_by = auth.uid())
WITH CHECK (published_by = auth.uid());

DROP POLICY IF EXISTS "Users can insert terms for their published lessons" ON public.explore_terms;
CREATE POLICY "Users can insert terms for their published lessons"
ON public.explore_terms FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update terms for their published lessons" ON public.explore_terms;
CREATE POLICY "Users can update terms for their published lessons"
ON public.explore_terms FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete terms for their published lessons" ON public.explore_terms;
CREATE POLICY "Users can delete terms for their published lessons"
ON public.explore_terms FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert questions for their published lessons" ON public.explore_questions;
CREATE POLICY "Users can insert questions for their published lessons"
ON public.explore_questions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update questions for their published lessons" ON public.explore_questions;
CREATE POLICY "Users can update questions for their published lessons"
ON public.explore_questions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete questions for their published lessons" ON public.explore_questions;
CREATE POLICY "Users can delete questions for their published lessons"
ON public.explore_questions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.explore_lessons l
    WHERE l.id = lesson_id
      AND l.published_by = auth.uid()
  )
);
