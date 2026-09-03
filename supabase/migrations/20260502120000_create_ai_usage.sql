-- AI 用量持久化：按 feature 记录每次调用（配合 app 内 lib/aiUsage.ts）
create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_feature_idx
  on public.ai_usage (user_id, feature, created_at);

alter table public.ai_usage enable row level security;

create policy "Users can read own usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

create policy "Users can insert own usage"
  on public.ai_usage for insert
  with check (auth.uid() = user_id);
