#!/bin/sh
# Disposable local database only; never connects to a hosted project.
set -eu
cd "$(dirname "$0")/.."
name="memq-staging-check-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=localtest-only public.ecr.aws/supabase/postgres:17.6.1.127 >/dev/null
ready=false
for i in $(seq 1 45); do
  if docker exec "$name" psql -U postgres -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || { echo 'Disposable database did not start' >&2; exit 1; }
docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL'
INSERT INTO auth.users(id) VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
SQL
docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/mcp_staging_core.sql
for sql in supabase/migrations/20261113090000_add_lesson_cover_style.sql supabase/migrations/20261113100000_add_mcp_create_lesson.sql supabase/migrations/20261113120000_add_mcp_update_card.sql supabase/migrations/20261113130000_add_mcp_practice_questions.sql supabase/migrations/20261113140000_add_mcp_cards_with_practice.sql supabase/migrations/20261113150000_track_practice_revision.sql supabase/tests/mcp_database.sql; do
  docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$sql"
done
if docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/mcp_staging_core.sql >/dev/null 2>&1; then
  echo 'Fixture unexpectedly accepted existing tables' >&2
  exit 1
fi
echo 'MCP staging core, ownership, transactions and existing-table guard passed.'
