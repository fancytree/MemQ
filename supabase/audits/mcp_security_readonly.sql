-- Read-only MCP security inventory. Run in Supabase SQL Editor as a project admin.
-- This reads PostgreSQL metadata only; it does not read application rows or secrets.
-- Review the full results before enabling OAuth. Passing this inventory alone
-- does not establish least-privilege access or replace two-user integration tests.
BEGIN TRANSACTION READ ONLY;

-- Exposed tables and row-security state, including storage objects.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p')
ORDER BY 1, 2;

-- Views may expose data with their owner's privileges unless configured for
-- invoker security; materialized views require separate access review.
SELECT n.nspname AS schema_name, c.relname AS view_name,
       CASE c.relkind WHEN 'v' THEN 'view' ELSE 'materialized view' END AS kind,
       c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('v', 'm')
ORDER BY 1, 2;

-- Policies reveal whether OAuth-issued tokens inherit broader account access.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- Direct table privileges for exposed application roles and PUBLIC.
SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema IN ('public', 'storage')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_schema, table_name, grantee, privilege_type;

-- Sequences and schemas can be exposed independently of table grants.
SELECT n.nspname AS schema_name, c.relname AS sequence_name,
       has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_usage,
       has_sequence_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_sequence_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       has_sequence_privilege('authenticated', c.oid, 'USAGE') AS authenticated_usage,
       has_sequence_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_sequence_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'S'
ORDER BY 1, 2;

SELECT n.nspname AS schema_name,
       has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
       has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage
FROM pg_catalog.pg_namespace AS n
WHERE n.nspname IN ('public', 'storage')
ORDER BY 1;

-- Functions callable by API roles can bypass table policy if SECURITY DEFINER.
-- Do not print function bodies: they can contain sensitive implementation details.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'storage')
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY 1, 2, 3;

-- Role inheritance can confer privileges not apparent from a direct grant.
SELECT member.rolname AS member, granted.rolname AS inherits_role
FROM pg_catalog.pg_auth_members AS m
JOIN pg_catalog.pg_roles AS member ON member.oid = m.member
JOIN pg_catalog.pg_roles AS granted ON granted.oid = m.roleid
WHERE member.rolname IN ('anon', 'authenticated', 'authenticator')
ORDER BY 1, 2;
ROLLBACK;
