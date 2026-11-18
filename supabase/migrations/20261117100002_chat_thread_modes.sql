-- The chat has two lines now: create and practice (spec §12). The column was
-- written for the three the old assistant had.
--
-- Widened rather than rewritten. The old values belong to conversations people
-- actually had, and reassigning them would silently reclassify someone's history to
-- make a constraint tidy. New rows only ever use 'create' or 'practice'; 'ask' and
-- 'vocab_lookup' stay readable and are never written again.
-- Dropped by what it says rather than by name. The old constraint was created
-- inline with ADD COLUMN ... CHECK, so its name is whatever Postgres generated;
-- guessing it and being wrong would leave the old constraint in place beside the
-- new one, and 'create' would still be rejected — silently, at runtime.
do $$
declare
  existing text;
begin
  for existing in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'chat_threads'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%vocab_lookup%'
  loop
    execute format('alter table public.chat_threads drop constraint %I', existing);
  end loop;
end
$$;

alter table public.chat_threads
  add constraint chat_threads_mode_check
  check (mode in ('create', 'practice', 'ask', 'vocab_lookup'));

comment on column public.chat_threads.mode is
  'Which chat line: create or practice. ask/vocab_lookup are retired values kept for existing rows.';

-- thread_id held an OpenAI thread id; threads are ours now and the id is a uuid we
-- mint. Still text, because the existing rows are not uuids.
comment on column public.chat_threads.thread_id is
  'Conversation id, minted by the chat function. Formerly an OpenAI thread id.';
