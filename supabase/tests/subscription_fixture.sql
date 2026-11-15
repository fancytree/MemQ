-- Disposable database only. Reproduces the observed production grants and function.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_pro boolean NOT NULL DEFAULT false,
  pro_expires_at timestamptz,
  subscription_plan text
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY profile_select ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profile_update ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated, service_role;
CREATE FUNCTION public.update_subscription_status(user_id uuid, new_is_pro boolean, new_pro_expires_at timestamptz, new_subscription_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET is_pro = new_is_pro, pro_expires_at = new_pro_expires_at,
    subscription_plan = new_subscription_plan, updated_at = now() WHERE id = user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_subscription_status(uuid, boolean, timestamptz, text) TO anon, authenticated, service_role;
