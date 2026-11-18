-- Record what each AI call actually cost, so the free limits can be set from data
-- instead of from the estimates in docs/AI_CHAT_SPEC.zh-CN.md §9.3.
--
-- `feature` already says which quota a row belongs to. These columns say what the
-- row cost: which model answered, which chat line it came from, and the token
-- counts the provider reported. `cached_tokens` is the one to watch — if it falls
-- well below the estimate, the prompt prefix has stopped being stable and the bill
-- multiplies (§9.2).
alter table public.ai_usage
  add column if not exists model             text,
  add column if not exists mode              text,
  add column if not exists prompt_tokens     integer,
  add column if not exists cached_tokens     integer,
  add column if not exists completion_tokens integer,
  add column if not exists tool_calls        integer,
  -- An opaque per-caller fingerprint, never a raw IP or device id: quotas keyed
  -- only on user_id reset with a new free account (§11.1), and a hash is enough
  -- to rate limit without storing anything about the person.
  add column if not exists client_hash       text;

create index if not exists ai_usage_client_idx
  on public.ai_usage (client_hash, created_at)
  where client_hash is not null;

comment on column public.ai_usage.cached_tokens is
  'Provider-reported cached prompt tokens. A sustained drop means the prompt prefix lost stability.';
comment on column public.ai_usage.client_hash is
  'Salted hash of caller fingerprint for abuse limits. Never a raw IP or device identifier.';
