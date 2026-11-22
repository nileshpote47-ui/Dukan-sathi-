-- Phase 9: Premium Autopilot (owner's decision). Once the owner turns it on, the app prepares this week's posts
-- (AI copy from upcoming festivals, shop-category ideas and the owner's own offers) every week. NOTHING is
-- published until the owner approves a post; approved posts are scheduled with the normal publishing system.
--   * billing_plans.autopilot_posts_per_week: plan data (Premium 5, others 0)
--   * autopilot_settings: on/off, accounts (Facebook / Instagram), post time, the owner's own offers
--   * autopilot_posts: this week's prepared posts and the owner's decision
--   * secret-gated functions for the weekly generator (no user session), and an hourly pg_cron tick

alter table public.billing_plans
  add column autopilot_posts_per_week integer not null default 0 check (autopilot_posts_per_week between 0 and 14);
comment on column public.billing_plans.autopilot_posts_per_week is 'Autopilot: posts prepared per week (0 = not in this plan).';
update public.billing_plans set autopilot_posts_per_week = 5 where slug = 'premium';

-- ---------------------------------------------------------------------------
-- Settings (one row per business)
-- ---------------------------------------------------------------------------

create table public.autopilot_settings (
  business_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  account_ids uuid[] not null default '{}' check (cardinality(account_ids) <= 10),
  -- India time of day for the posts.
  post_time time not null default '10:00',
  -- The owner's own offers and prices, used word for word (never invented).
  owner_offers text check (char_length(owner_offers) <= 500),
  -- The week the generator last ran for (it runs at most once per week; no automatic retries).
  last_run_week date,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autopilot_settings_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade
);

create trigger autopilot_settings_set_updated_at
  before update on public.autopilot_settings
  for each row execute function public.set_updated_at();

-- The run markers are written only by the generator (definer functions), never by the owner.
create or replace function public.autopilot_settings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.last_run_week := null;
      new.last_run_at := null;
    else
      new.last_run_week := old.last_run_week;
      new.last_run_at := old.last_run_at;
      new.owner_id := old.owner_id;
      new.business_id := old.business_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.autopilot_settings_guard() from public, anon, authenticated;

create trigger autopilot_settings_guard
  before insert or update on public.autopilot_settings
  for each row execute function public.autopilot_settings_guard();

alter table public.autopilot_settings enable row level security;
create policy "Owners read their autopilot settings" on public.autopilot_settings
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create autopilot settings for their business" on public.autopilot_settings
  for insert to authenticated with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  );
create policy "Owners update their autopilot settings" on public.autopilot_settings
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Owners delete their autopilot settings" on public.autopilot_settings
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Prepared posts
-- ---------------------------------------------------------------------------

create table public.autopilot_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  -- Monday (India time) of the week the post belongs to.
  week_start date not null check (extract(isodow from week_start) = 1),
  slot smallint not null check (slot between 1 and 14),
  planned_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SCHEDULED', 'SKIPPED')),
  -- Where the idea came from (festival slug or category idea), for the owner's information.
  idea jsonb not null default '{}'::jsonb check (jsonb_typeof(idea) = 'object' and pg_column_size(idea) <= 2000),
  job_ids uuid[] not null default '{}' check (cardinality(job_ids) <= 10),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autopilot_posts_week_slot_key unique (business_id, week_start, slot),
  constraint autopilot_posts_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade
);

create index autopilot_posts_owner_week_idx on public.autopilot_posts (owner_id, week_start desc);
create index autopilot_posts_content_idx on public.autopilot_posts (content_item_id);

create trigger autopilot_posts_set_updated_at
  before update on public.autopilot_posts
  for each row execute function public.set_updated_at();

-- The owner may only record a decision (PENDING → SCHEDULED or SKIPPED, once); everything else is fixed.
create or replace function public.autopilot_posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id or new.owner_id is distinct from old.owner_id
     or new.content_item_id is distinct from old.content_item_id or new.week_start is distinct from old.week_start
     or new.slot is distinct from old.slot or new.planned_for is distinct from old.planned_for
     or new.idea is distinct from old.idea then
    raise exception 'Autopilot posts cannot be changed' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'PENDING' or new.status not in ('SCHEDULED', 'SKIPPED') then
      raise exception 'Autopilot decision % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
    new.decided_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.autopilot_posts_guard() from public, anon, authenticated;

create trigger autopilot_posts_guard
  before update on public.autopilot_posts
  for each row execute function public.autopilot_posts_guard();

alter table public.autopilot_posts enable row level security;
create policy "Owners read their autopilot posts" on public.autopilot_posts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners decide on their autopilot posts" on public.autopilot_posts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
-- No insert/delete policies: posts are created only by the generator; deleting the content removes them.

-- ---------------------------------------------------------------------------
-- Generator functions (no user session; the caller must know the server secret)
-- ---------------------------------------------------------------------------

-- Businesses whose autopilot is on, whose plan includes it, and for which this week has not run yet.
create or replace function public.autopilot_due(p_secret text, p_week_start date)
returns table (
  business_id uuid,
  owner_id uuid,
  business jsonb,
  preferred_language text,
  owner_offers text,
  posts_per_week integer,
  post_time time
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publishing_assert_server(p_secret);
  return query
    select b.id, b.owner_id, to_jsonb(b), p.preferred_language, s.owner_offers, bp.autopilot_posts_per_week, s.post_time
    from public.autopilot_settings s
    join public.businesses b on b.id = s.business_id and b.onboarding_completed_at is not null
    join public.billing_plans bp on bp.id = public.billing_current_plan_id(b.id)
    left join public.profiles p on p.user_id = b.owner_id
    where s.enabled and cardinality(s.account_ids) > 0
      and bp.autopilot_posts_per_week > 0
      and s.last_run_week is distinct from p_week_start
    order by s.updated_at
    limit 20;
end;
$$;

-- Mark the week as run (once) and reserve up to p_count AI posts from the owner's plan.
-- Returns the reservations; an empty array when the week already ran or no AI posts are left.
create or replace function public.autopilot_begin(p_secret text, p_business_id uuid, p_week_start date, p_count integer)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  perform public.publishing_assert_server(p_secret);
  update public.autopilot_settings
  set last_run_week = p_week_start, last_run_at = now()
  where business_id = p_business_id and enabled and last_run_week is distinct from p_week_start
  returning owner_id into v_owner;
  if v_owner is null then
    return v_ids;
  end if;
  for i in 1 .. least(greatest(p_count, 0), 14) loop
    begin
      v_id := public.billing_reserve_for(p_business_id, v_owner, 'ai_text_generation', 'autopilot', p_week_start::text);
      v_ids := v_ids || v_id;
    exception when sqlstate 'P0001' then
      exit; -- the plan's AI posts for this month are used up
    end;
  end loop;
  return v_ids;
end;
$$;

-- Save the prepared posts as DRAFT content (with AI copy) plus their autopilot rows; commit the credits used
-- and release the rest. p_posts: [{slot, planned_for, title, content_type, language, description, offer_text,
-- generated_copy, ai_provider, ai_model, idea}]
create or replace function public.autopilot_save(p_secret text, p_business_id uuid, p_week_start date, p_posts jsonb, p_commit uuid[], p_release uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_post jsonb;
  v_content uuid;
  v_saved integer := 0;
begin
  perform public.publishing_assert_server(p_secret);
  select b.owner_id into v_owner from public.businesses b where b.id = p_business_id;
  if v_owner is null then
    raise exception 'autopilot:business_not_found' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) > 14 then
    raise exception 'autopilot:invalid_posts' using errcode = '22023';
  end if;

  for v_post in select * from jsonb_array_elements(p_posts) loop
    insert into public.content_items (business_id, owner_id, title, content_type, language, description, offer_text,
      generated_copy, ai_provider, ai_model, ai_generated_at)
    values (p_business_id, v_owner, v_post ->> 'title', v_post ->> 'content_type', v_post ->> 'language',
      nullif(v_post ->> 'description', ''), nullif(v_post ->> 'offer_text', ''),
      v_post -> 'generated_copy', v_post ->> 'ai_provider', v_post ->> 'ai_model', now())
    returning id into v_content;

    insert into public.autopilot_posts (business_id, owner_id, content_item_id, week_start, slot, planned_for, idea)
    values (p_business_id, v_owner, v_content, p_week_start, (v_post ->> 'slot')::smallint,
      (v_post ->> 'planned_for')::timestamptz, coalesce(v_post -> 'idea', '{}'::jsonb));
    v_saved := v_saved + 1;
  end loop;

  update public.usage_ledger set state = 'COMMITTED', description = 'Used (Autopilot)'
  where id = any(coalesce(p_commit, '{}')) and business_id = p_business_id and state = 'PENDING';
  update public.usage_ledger set state = 'RELEASED', description = 'Not charged (Autopilot)'
  where id = any(coalesce(p_release, '{}')) and business_id = p_business_id and state = 'PENDING';
  return v_saved;
end;
$$;

revoke execute on function public.autopilot_due(text, date) from public;
revoke execute on function public.autopilot_begin(text, uuid, date, integer) from public;
revoke execute on function public.autopilot_save(text, uuid, date, jsonb, uuid[], uuid[]) from public;
-- Useless without the server secret (checked inside); the generator calls them without a session.
grant execute on function public.autopilot_due(text, date) to anon, authenticated;
grant execute on function public.autopilot_begin(text, uuid, date, integer) to anon, authenticated;
grant execute on function public.autopilot_save(text, uuid, date, jsonb, uuid[], uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hourly tick: call the app's generator only when some business is due this week
-- ---------------------------------------------------------------------------

create or replace function public.autopilot_cron_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_week date := (date_trunc('week', (now() at time zone 'Asia/Kolkata')))::date;
begin
  if not exists (
    select 1 from public.autopilot_settings s
    join public.billing_plans bp on bp.id = public.billing_current_plan_id(s.business_id)
    where s.enabled and cardinality(s.account_ids) > 0 and bp.autopilot_posts_per_week > 0
      and s.last_run_week is distinct from v_week
  ) then
    return;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'publishing_runner_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'publishing_server_secret';
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return;
  end if;
  perform net.http_post(
    url := regexp_replace(v_url, '/api/publishing/run$', '/api/autopilot/run'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.autopilot_cron_tick() from public, anon, authenticated;

select cron.schedule('autopilot-generator', '23 * * * *', $$select public.autopilot_cron_tick()$$);
