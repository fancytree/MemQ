-- Memory for chat: a conversation that is still there when you come back, and a
-- few things Inkling knows about the person from one conversation to the next.
--
-- Three changes, each the smallest that does its job.

-- 1. What was on screen, kept so it can be drawn again.
--
-- A conversation now stays until the person clears it. Until this, only words were
-- kept: an interface (a set of draft cards, the offer of a round, the choice of a
-- lesson) was remembered as a sentence about it. That is enough for the model and
-- not for the screen — reopened, the drafts would come back as a line of text that
-- cannot be ticked. So a `system` row may carry what it stood for.
--
-- Nullable, and nothing reads it but the app: the model is still given the
-- sentence, never the payload.
alter table public.chat_messages add column if not exists payload jsonb;

comment on column public.chat_messages.payload is
  'For a system row that stands for an interface: {component, props, ...}. Drawn by the app; never sent to the model.';

-- 2. Clearing a conversation removes it.
--
-- Threads could be made, read and updated by their owner, but not deleted, so
-- "clear" could only start a new one and leave the old one to be reopened next
-- time. The messages go with the thread (fk_chat_messages_thread, on delete
-- cascade).
drop policy if exists "Users can delete their own chat threads" on public.chat_threads;
create policy "Users can delete their own chat threads"
  on public.chat_threads for delete
  using (auth.uid() = user_id);

-- 3. What Inkling remembers about someone.
--
-- A short list of things the person has said about themselves — why they are
-- learning, what they prefer — that should hold across conversations and across
-- both chat lines. Not a copy of anything the database already knows: lessons,
-- cards and progress are read live, because a remembered copy of them goes stale
-- the moment they change.
--
-- Written and read by the chat function with the caller's own token, so row-level
-- security is what makes a memory theirs. Gone with the account.
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_memories_user_idx on public.user_memories (user_id, created_at);

alter table public.user_memories enable row level security;

drop policy if exists "Users can view their own memories" on public.user_memories;
create policy "Users can view their own memories"
  on public.user_memories for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memories" on public.user_memories;
create policy "Users can insert their own memories"
  on public.user_memories for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memories" on public.user_memories;
create policy "Users can delete their own memories"
  on public.user_memories for delete using (auth.uid() = user_id);
