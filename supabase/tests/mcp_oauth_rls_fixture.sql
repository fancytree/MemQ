-- Disposable test database only.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.user_daily_progress (user_id uuid NOT NULL, value int NOT NULL);
ALTER TABLE public.user_daily_progress OWNER TO postgres;
ALTER TABLE public.user_daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_owner ON public.user_daily_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_daily_progress TO authenticated;
-- Representative owner-scoped personal tables; production schemas must be tested separately.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['profiles', 'ai_usage', 'chat_threads', 'chat_messages'] LOOP
    EXECUTE format('CREATE TABLE public.%I (user_id uuid NOT NULL, value int NOT NULL)', name);
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('CREATE POLICY test_owner ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', name);
  END LOOP;
END $$;
CREATE TABLE public.user_term_progress (term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE, user_id uuid NOT NULL);
ALTER TABLE public.user_term_progress OWNER TO postgres;
ALTER TABLE public.user_term_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_progress_owner ON public.user_term_progress FOR ALL TO authenticated
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_term_progress TO authenticated;
