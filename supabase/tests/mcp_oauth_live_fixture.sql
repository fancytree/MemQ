-- Only for the disposable local OAuth project, where Auth provides auth.jwt().
CREATE TABLE public.user_daily_progress (user_id uuid NOT NULL, value int NOT NULL);
ALTER TABLE public.user_daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_owner ON public.user_daily_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_daily_progress TO authenticated;
