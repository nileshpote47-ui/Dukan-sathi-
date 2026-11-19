-- Phase 8: per-user burst limits for expensive operations (AI text, AI pictures, reels, poster
-- exports, publishing, social connections). A safety layer in front of the Phase 5 monthly
-- entitlements, not a replacement: limits are short windows (minutes), configured in
-- lib/config/rate-limits.ts. Fixed windows; the subject is always auth.uid().

create table public.rate_limit_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (user_id, action, window_start)
);

comment on table public.rate_limit_counters is 'Per-user request counters for short rate-limit windows. Written only by rate_limit_hit().';

-- No API access: only the function below reads or writes it.
alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from anon, authenticated;

-- Counts one request for the signed-in user and returns true while the user is within the limit.
create or replace function public.rate_limit_hit(p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_hits integer;
begin
  if v_uid is null then
    raise exception 'rate_limit:unauthenticated' using errcode = '42501';
  end if;
  if p_action is null or p_action !~ '^[a-z_]{1,40}$'
     or p_limit is null or p_limit not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'rate_limit:invalid' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as c (user_id, action, window_start, hits)
  values (v_uid, p_action, v_window, 1)
  on conflict (user_id, action, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  -- Keep the table small: this user's windows older than a day are no longer needed.
  delete from public.rate_limit_counters
  where user_id = v_uid and window_start < now() - interval '1 day';

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon;
grant execute on function public.rate_limit_hit(text, integer, integer) to authenticated;
