-- Read-only metadata inventory in one result row for the Supabase SQL Editor.
-- No application rows, function bodies, tokens or credentials are selected.
-- A result is evidence to review, not proof of safe OAuth permissions.
-- Effective SQL privileges include inherited grants but do not evaluate RLS;
-- view updatability and inherited access must be reviewed separately.
WITH relations AS (
  SELECT n.nspname AS schema_name, c.relname AS name, c.relkind AS kind,
         c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
         c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner,
         has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
         has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
         has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
         has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
         has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
         has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
         has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
         has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
         has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
         has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p', 'v', 'm')
), policies AS (
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_catalog.pg_policies WHERE schemaname IN ('public', 'storage')
), table_grants AS (
  SELECT table_schema, table_name, grantee, privilege_type, is_grantable
  FROM information_schema.table_privileges
  WHERE table_schema IN ('public', 'storage') AND grantee IN ('anon', 'authenticated', 'PUBLIC')
), functions AS (
  SELECT n.nspname AS schema_name, p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS arguments,
         p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'storage')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), sequences AS (
  SELECT n.nspname AS schema_name, c.relname AS name,
         has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_usage,
         has_sequence_privilege('anon', c.oid, 'SELECT') AS anon_select,
         has_sequence_privilege('anon', c.oid, 'UPDATE') AS anon_update,
         has_sequence_privilege('authenticated', c.oid, 'USAGE') AS authenticated_usage,
         has_sequence_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
         has_sequence_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'S'
), schemas AS (
  SELECT n.nspname AS schema_name,
         has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
         has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage
  FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public', 'storage')
), role_membership AS (
  SELECT member.rolname AS member, granted.rolname AS inherits_role
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles member ON member.oid = m.member
  JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
  WHERE member.rolname IN ('anon', 'authenticated', 'authenticator')
)
SELECT jsonb_build_object(
  'relations', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.schema_name, r.name) FROM relations r), '[]'::jsonb),
  'policies', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname, p.tablename, p.policyname) FROM policies p), '[]'::jsonb),
  'table_grants', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_schema, g.table_name, g.grantee, g.privilege_type) FROM table_grants g), '[]'::jsonb),
  'functions', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.schema_name, f.name, f.arguments) FROM functions f), '[]'::jsonb),
  'sequences', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.schema_name, s.name) FROM sequences s), '[]'::jsonb),
  'schemas', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.schema_name) FROM schemas s), '[]'::jsonb),
  'role_membership', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.member, m.inherits_role) FROM role_membership m), '[]'::jsonb)
) AS inventory;
