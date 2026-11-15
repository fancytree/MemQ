#!/bin/sh
# Runs only inside the named disposable container created by test-mcp-db.sh.
set -eu
name="$1"
case "$name" in memq-mcp-test-[0-9]*) ;; *) echo 'Refusing non-test container' >&2; exit 1;; esac
lesson=$(docker exec "$name" psql -At -U postgres -d postgres -c "SELECT id FROM public.lessons WHERE name='Italian'")
card=$(docker exec "$name" psql -At -U postgres -d postgres -c "SELECT id FROM public.terms WHERE term='ciao'")
[ -n "$lesson" ] && [ -n "$card" ]
log="/private/tmp/memq-revision-race-$$.log"
for mode in insert update; do
  revision=$(docker exec "$name" psql -At -U postgres -d postgres -c "SELECT content_revision FROM public.terms WHERE id='$card'")
  [ -n "$revision" ]
  if [ "$mode" = update ]; then
    docker exec "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO public.questions(term_id,question_text,question_type,correct_answer,source_revision) VALUES ('$card','Original question','fill_blank','Original answer','$revision')"
  fi
  docker exec "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SET application_name='memq_revision_editor'; BEGIN; UPDATE public.terms SET definition='Changed concurrently $mode' WHERE id='$card'; SELECT pg_sleep(5); COMMIT" > "$log" 2>&1 &
  editor=$!
  i=0
  while :; do
    ready=$(docker exec "$name" psql -At -U postgres -d postgres -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='memq_revision_editor' AND wait_event='PgSleep'")
    [ "$ready" = 1 ] && break
    i=$((i + 1)); [ "$i" -lt 40 ] || { echo 'Editor did not acquire the test lock' >&2; wait "$editor" || true; rm -f "$log"; exit 1; }
    sleep 0.1
  done
  if [ "$mode" = insert ]; then
    expected='Card changed; reload it before creating the question'
    if docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -v lesson="$lesson" -v card="$card" -v revision="$revision" -U postgres -d postgres > "$log.writer" 2>&1 <<'SQL'
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.mcp_add_practice_questions(:'lesson'::uuid, jsonb_build_array(jsonb_build_object(
  'card_id', :'card', 'card_revision', :'revision', 'question_type', 'fill_blank',
  'question_text', 'Old content?', 'correct_answer', 'Old answer'
)));
SQL
    then success=true; else success=false; fi
  else
    expected='Card changed; reload it before updating the question'
    if docker exec -i "$name" psql -q -v ON_ERROR_STOP=1 -v card="$card" -v revision="$revision" -U postgres -d postgres > "$log.writer" 2>&1 <<'SQL'
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
UPDATE public.questions SET question_text='Incorrectly updated', source_revision=:'revision'::uuid WHERE term_id=:'card'::uuid;
SQL
    then success=true; else success=false; fi
  fi
  wait "$editor"
  if [ "$success" = true ] || ! rg -q "$expected" "$log.writer"; then
    cat "$log.writer" >&2
    rm -f "$log" "$log.writer"
    echo "Concurrent stale $mode was not rejected as expected" >&2
    exit 1
  fi
  remaining=$(docker exec "$name" psql -At -U postgres -d postgres -c "SELECT count(*) FROM public.questions WHERE term_id='$card' AND question_text <> 'Original question'")
  [ "$remaining" = 0 ] || { echo 'Stale question was saved' >&2; exit 1; }
done
docker exec "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "DELETE FROM public.questions WHERE term_id='$card'"
rm -f "$log" "$log.writer"
printf '%s\n' 'Concurrent card-edit and question insert/update tests passed.'
