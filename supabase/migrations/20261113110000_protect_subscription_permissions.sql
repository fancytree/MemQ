-- Restrict subscription changes to trusted server-side operations.
-- The profiles table currently has no user-editable fields; app profile settings
-- are stored in auth metadata. Preserve authenticated INSERT(id) for recovery of
-- a missing profile while forcing subscription columns to use their defaults.
BEGIN;
REVOKE ALL ON FUNCTION public.update_subscription_status(uuid, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_subscription_status(uuid, boolean, timestamptz, text) TO service_role;

-- Revoke both table-level and any pre-existing column-level grants. A table-level
-- grant would otherwise override a column-level revoke.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, created_at, updated_at, is_pro, pro_expires_at, subscription_plan)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, created_at, updated_at, is_pro, pro_expires_at, subscription_plan)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT INSERT (id) ON TABLE public.profiles TO authenticated;
COMMIT;
