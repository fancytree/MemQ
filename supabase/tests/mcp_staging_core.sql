-- MCP-only fixture for a NEW, empty Supabase test project.
-- This is not a full app schema or a migration for production. Never run it
-- against an existing project. The guard aborts if any target table exists.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL OR to_regclass('public.terms') IS NOT NULL
     OR to_regclass('public.questions') IS NOT NULL THEN
    RAISE EXCEPTION 'MCP staging core requires an empty project';
  END IF;
END $$;

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, description text, deadline timestamptz,
  created_at timestamptz DEFAULT now(), is_vocab_mode boolean,
  learning_mode text NOT NULL DEFAULT 'knowledge' CHECK (learning_mode IN ('language','knowledge'))
);
CREATE TABLE public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  term text NOT NULL, definition text NOT NULL, explanation text,
  created_at timestamptz DEFAULT now(), language_data jsonb
);
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  question_text text NOT NULL, question_type text DEFAULT 'mcq', options jsonb,
  correct_answer text NOT NULL, explanation text, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_owner ON public.lessons FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY term_owner ON public.terms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=terms.lesson_id AND l.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=terms.lesson_id AND l.user_id=auth.uid()));
CREATE POLICY question_owner ON public.questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.terms t JOIN public.lessons l ON l.id=t.lesson_id WHERE t.id=questions.term_id AND l.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.terms t JOIN public.lessons l ON l.id=t.lesson_id WHERE t.id=questions.term_id AND l.user_id=auth.uid()));
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons, public.terms, public.questions TO authenticated;
COMMIT;
