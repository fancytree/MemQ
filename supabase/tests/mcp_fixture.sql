-- Disposable test database only. Do not apply to a production project.
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE TABLE public.lessons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL, description text, learning_mode text NOT NULL DEFAULT 'knowledge' CHECK (learning_mode IN ('language', 'knowledge')), is_vocab_mode boolean, deadline timestamptz, cover_style text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.terms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE, term text NOT NULL, definition text NOT NULL, explanation text, language_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE, question_text text NOT NULL, question_type text NOT NULL, options jsonb, correct_answer text NOT NULL, explanation text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_owner ON public.questions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.terms t JOIN public.lessons l ON l.id=t.lesson_id WHERE t.id=questions.term_id AND l.user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.terms t JOIN public.lessons l ON l.id=t.lesson_id WHERE t.id=questions.term_id AND l.user_id=auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_owner ON public.lessons FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY term_owner ON public.terms FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = terms.lesson_id AND l.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = terms.lesson_id AND l.user_id = auth.uid()));
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons, public.terms TO authenticated;
