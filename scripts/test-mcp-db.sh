#!/bin/sh
# Isolated local database. Never connects to the configured Supabase project.
set -eu
cd "$(dirname "$0")/.."
name="memq-mcp-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=localtest-only public.ecr.aws/supabase/postgres:17.6.1.127 >/dev/null
count=0
ready=0
while [ "$ready" -lt 3 ]; do
  if docker exec "$name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc "SET ROLE anon; RESET ROLE; SET ROLE authenticated; SELECT auth.uid();" >/dev/null 2>&1; then
    ready=$((ready + 1))
  else
    ready=0
  fi
  count=$((count + 1))
  if [ "$count" -gt 60 ]; then echo 'Database did not start' >&2; exit 1; fi
  sleep 1
done
for sql in supabase/tests/mcp_fixture.sql supabase/migrations/20261113100000_add_mcp_create_lesson.sql supabase/migrations/20261113120000_add_mcp_update_card.sql supabase/migrations/20261113130000_add_mcp_practice_questions.sql supabase/migrations/20261113140000_add_mcp_cards_with_practice.sql supabase/tests/mcp_revision_backfill_fixture.sql supabase/migrations/20261113150000_track_practice_revision.sql supabase/tests/mcp_revision_backfill_test.sql supabase/tests/mcp_database.sql; do
  docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql"
done
./scripts/test-mcp-revision-race.sh "$name"
for sql in supabase/tests/pdf_storage_fixture.sql supabase/audits/pdf_private_candidate.sql supabase/tests/pdf_storage_private_test.sql; do
  docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "$sql"
done
# Ensure the production metadata inventory is syntactically valid on Supabase Postgres.
docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/audits/mcp_security_readonly.sql > /dev/null
docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/audits/mcp_security_inventory_json.sql > /dev/null
printf '%s\n' 'Read-only security inventory executed successfully.'

docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < supabase/tests/mcp_oauth_rls_fixture.sql
for sql in supabase/audits/mcp_oauth_rls_candidate.sql supabase/tests/mcp_oauth_rls_test.sql; do
  docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql"
done

for sql in supabase/tests/subscription_fixture.sql supabase/migrations/20261113110000_protect_subscription_permissions.sql supabase/tests/subscription_permissions.sql; do
  docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql"
done
