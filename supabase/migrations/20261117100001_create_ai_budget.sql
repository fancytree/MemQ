-- A daily ceiling on what the whole platform may spend on models.
--
-- This is not a quota: per-user limits live in ai_usage. This is the switch that
-- keeps one bad day — a launch, a script hammering the endpoint — from costing more
-- than the project earns, which is nothing. Once the day's spend passes the
-- threshold, free callers lose AI features and fall back to adding cards by hand;
-- paying callers are unaffected.
--
-- Spend is in micro-dollars because a single chat message can cost $0.0004, which
-- rounds to zero in cents.
create table if not exists public.ai_budget (
  day          date primary key default current_date,
  spend_micros bigint not null default 0,
  calls        integer not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.ai_budget enable row level security;

-- No policies on purpose: this is operational state, not user data, and no client
-- may read or write it. A client that could inflate the counter would be able to
-- switch off AI for every free user, so both functions below are service-role only.

create or replace function public.ai_budget_add(p_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  total bigint;
begin
  if p_micros < 0 then
    raise exception 'Spend cannot be negative.';
  end if;
  insert into public.ai_budget (day, spend_micros, calls)
       values (current_date, p_micros, 1)
  -- The existing row is referenced by bare table name here; schema-qualifying it
  -- inside ON CONFLICT is not valid.
  on conflict (day) do update
    set spend_micros = ai_budget.spend_micros + excluded.spend_micros,
        calls        = ai_budget.calls + 1,
        updated_at   = now()
  returning spend_micros into total;
  return total;
end;
$$;

create or replace function public.ai_budget_today()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce((select spend_micros from public.ai_budget where day = current_date), 0);
$$;

revoke execute on function public.ai_budget_add(bigint)  from public, anon, authenticated;
revoke execute on function public.ai_budget_today()      from public, anon, authenticated;
grant  execute on function public.ai_budget_add(bigint)  to service_role;
grant  execute on function public.ai_budget_today()      to service_role;
