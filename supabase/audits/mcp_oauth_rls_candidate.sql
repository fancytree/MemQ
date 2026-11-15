-- STAGING CANDIDATE ONLY. Do not apply to production without an inventory of
-- deployed tables, storage, views, callable functions, and Edge Functions.
-- OAuth clients may manage their own lessons/terms/questions through existing owner
-- policies. These restrictive policies deny access to other personal tables.
BEGIN;
DO $$
DECLARE table_name text; relation_id regclass;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'user_daily_progress', 'user_term_progress',
    'ai_usage', 'chat_threads', 'chat_messages'
  ] LOOP
    relation_id := to_regclass(format('public.%I', table_name));
    IF relation_id IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = relation_id) THEN
      RAISE EXCEPTION 'RLS must be enabled before restricting OAuth: %', relation_id;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS mcp_direct_session_only ON %s', relation_id);
    EXECUTE format(
      'CREATE POLICY mcp_direct_session_only ON %s AS RESTRICTIVE FOR ALL TO authenticated USING ((select auth.jwt() ->> ''client_id'') IS NULL) WITH CHECK ((select auth.jwt() ->> ''client_id'') IS NULL)',
      relation_id
    );
  END LOOP;
END $$;
COMMIT;
