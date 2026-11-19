-- Phase 7: analytics (owner), external engagement snapshots, admin foundation + audit log.
--
-- * Owner analytics are computed on demand by analytics_business_overview() as SECURITY INVOKER:
--   it runs as the signed-in owner, so RLS limits every query to their own rows.
-- * Engagement numbers from platforms (Facebook reactions/comments/shares, Instagram likes/
--   comments) are stored as snapshots in publishing_metrics, written only by the server
--   (publishing secret) after an explicit refresh. Nothing is estimated.
-- * Admins are listed explicitly in admin_users (granted with SQL, never through the API).
--   Every admin_* function checks that list first and records the view in admin_audit_logs.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 200),
  granted_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('ADMIN_VIEW_OVERVIEW', 'ADMIN_VIEW_BUSINESSES', 'ADMIN_VIEW_BUSINESS', 'ADMIN_VIEW_USERS', 'ADMIN_VIEW_USER', 'ADMIN_VIEW_BILLING', 'ADMIN_VIEW_USAGE', 'ADMIN_VIEW_PUBLISHING', 'ADMIN_VIEW_SYSTEM')),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 100),
  -- Filters used (search text, page, range). Never secrets or personal data beyond ids.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 2000),
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id);

-- Latest engagement numbers per published job, as reported by the platform.
create table public.publishing_metrics (
  job_id uuid primary key references public.publishing_jobs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE')),
  status text not null check (status in ('OK', 'UNSUPPORTED', 'PERMISSION_DENIED', 'RATE_LIMITED', 'NOT_FOUND', 'ERROR')),
  -- Only counts the platform returned, e.g. {"likes": 12, "comments": 3}. Missing = not available.
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 1000),
  fetched_at timestamptz not null default now()
);
create index publishing_metrics_owner_idx on public.publishing_metrics (owner_id, fetched_at desc);

-- Query patterns of the analytics/admin functions (media_assets_owner_created_idx and
-- usage_ledger_owner_idx from earlier phases already cover media and usage by owner + time).
create index content_items_owner_created_idx on public.content_items (owner_id, created_at);
create index publishing_jobs_owner_published_idx on public.publishing_jobs (owner_id, published_at) where status = 'PUBLISHED';
create index publishing_attempts_failed_idx on public.publishing_attempts (finished_at desc) where outcome = 'FAILED';

revoke all on public.admin_users, public.admin_audit_logs, public.publishing_metrics from anon, authenticated;
grant select on public.publishing_metrics to authenticated;
alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.publishing_metrics enable row level security;
create policy "Owners read their engagement snapshots" on public.publishing_metrics
  for select to authenticated using ((select auth.uid()) = owner_id);
-- admin_users, admin_audit_logs: RLS on, no policies (only definer functions use them).

-- ---------------------------------------------------------------------------
-- Owner analytics
-- ---------------------------------------------------------------------------

-- When a job "happened" for reporting: published / failed / cancelled time, or its planned time.
create or replace function public.analytics_job_time(j public.publishing_jobs)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case j.status
    when 'PUBLISHED' then j.published_at
    when 'FAILED' then coalesce(j.last_attempt_at, j.updated_at)
    when 'CANCELLED' then coalesce(j.cancelled_at, j.updated_at)
    else j.scheduled_for
  end
$$;

create or replace function public.analytics_business_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prev timestamptz;
  v_tz constant text := 'Asia/Kolkata';
begin
  if v_uid is null then
    raise exception 'analytics:not_signed_in' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '367 days' then
    raise exception 'analytics:invalid_range' using errcode = '22023';
  end if;
  v_prev := p_from - (p_to - p_from);

  return (
    with
    c as (select * from public.content_items where owner_id = v_uid),
    c_in as (select * from c where created_at >= p_from and created_at < p_to),
    j as (select jj.*, public.analytics_job_time(jj) as t from public.publishing_jobs jj where jj.owner_id = v_uid),
    j_in as (select * from j where t >= p_from and t < p_to),
    u as (select * from public.usage_ledger where owner_id = v_uid and transaction_type = 'USAGE' and created_at >= p_from and created_at < p_to),
    m as (select * from public.media_assets where owner_id = v_uid and created_at >= p_from and created_at < p_to),
    days as (
      select d::date as day
      from generate_series((p_from at time zone v_tz)::date, ((p_to - interval '1 microsecond') at time zone v_tz)::date, interval '1 day') d
    )
    select jsonb_build_object(
      'content', jsonb_build_object(
        'created', (select count(*) from c_in),
        'created_previous', (select count(*) from c where created_at >= v_prev and created_at < p_from),
        'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from c_in group by 1) s), '{}'::jsonb),
        'by_type', coalesce((select jsonb_object_agg(content_type, n) from (select content_type, count(*) n from c_in group by 1) s), '{}'::jsonb),
        'by_language', coalesce((select jsonb_object_agg(language, n) from (select language, count(*) n from c_in group by 1) s), '{}'::jsonb),
        'now', jsonb_build_object(
          'total', (select count(*) from c),
          'draft', (select count(*) from c where status = 'DRAFT'),
          'ready', (select count(*) from c where status = 'READY'),
          'scheduled_upcoming', (select count(*) from c where status = 'SCHEDULED' and scheduled_for >= now()),
          'published', (select count(*) from c where status = 'PUBLISHED')
        )
      ),
      'publishing', jsonb_build_object(
        'published', (select count(*) from j_in where status = 'PUBLISHED'),
        'failed', (select count(*) from j_in where status = 'FAILED'),
        'cancelled', (select count(*) from j_in where status = 'CANCELLED'),
        'pending', (select count(*) from j_in where status in ('QUEUED', 'SENDING')),
        'published_previous', (select count(*) from j where status = 'PUBLISHED' and t >= v_prev and t < p_from),
        'upcoming', (select count(*) from j where status = 'QUEUED' and scheduled_for > now()),
        'by_channel', coalesce((
          select jsonb_agg(jsonb_build_object('channel', channel, 'published', published, 'failed', failed, 'cancelled', cancelled) order by published desc, channel)
          from (
            select channel,
              count(*) filter (where status = 'PUBLISHED') published,
              count(*) filter (where status = 'FAILED') failed,
              count(*) filter (where status = 'CANCELLED') cancelled
            from j_in group by channel
          ) s
        ), '[]'::jsonb),
        -- Scheduler delay: published time minus planned time, scheduled posts only.
        'avg_delay_seconds', (
          select round(extract(epoch from avg(published_at - scheduled_for)))
          from j_in where status = 'PUBLISHED' and publish_mode = 'SCHEDULED'
        ),
        'recent_failures', coalesce((
          select jsonb_agg(x order by x ->> 'at' desc)
          from (
            select jsonb_build_object('id', id, 'title', title, 'channel', channel, 'error_code', error_code, 'at', t) x
            from j_in where status = 'FAILED' order by t desc limit 5
          ) f
        ), '[]'::jsonb),
        'whatsapp', (
          select jsonb_build_object(
            'sent', count(*) filter (where wm.status <> 'FAILED'),
            'delivered', count(*) filter (where wm.status in ('DELIVERED', 'READ')),
            'read', count(*) filter (where wm.status = 'READ'),
            'failed', count(*) filter (where wm.status = 'FAILED'))
          from public.whatsapp_messages wm
          where wm.owner_id = v_uid and wm.created_at >= p_from and wm.created_at < p_to
        )
      ),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', d.day,
          'created', (select count(*) from c_in where (created_at at time zone v_tz)::date = d.day),
          'published', (select count(*) from j_in where status = 'PUBLISHED' and (t at time zone v_tz)::date = d.day),
          'ai', (select count(*) from u where feature_key = 'ai_text_generation' and state = 'COMMITTED' and (created_at at time zone v_tz)::date = d.day)
        ) order by d.day)
        from days d
      ), '[]'::jsonb),
      'usage', coalesce((
        select jsonb_object_agg(feature_key, jsonb_build_object('used', used, 'failed', failed))
        from (
          select feature_key,
            count(*) filter (where state = 'COMMITTED') used,
            count(*) filter (where state = 'RELEASED') failed
          from u group by 1
        ) s
      ), '{}'::jsonb),
      'media', jsonb_build_object(
        'created', (select count(*) from m where status = 'READY'),
        'ai_generated', (select count(*) from m where status = 'READY' and source_type = 'AI_GENERATED'),
        'uploaded', (select count(*) from m where status = 'READY' and source_type = 'UPLOAD'),
        'posters', (select count(*) from m where status = 'READY' and asset_type = 'POSTER'),
        'failed', (select count(*) from m where status = 'FAILED')
      ),
      'channels', jsonb_build_object(
        'connected', coalesce((
          select jsonb_object_agg(channel, n) from (
            select channel, count(*) n from public.social_accounts where owner_id = v_uid and status = 'CONNECTED' group by 1
          ) s
        ), '{}'::jsonb),
        'needs_attention', (select count(*) from public.social_accounts where owner_id = v_uid and status in ('EXPIRED', 'REVOKED', 'ERROR'))
      ),
      'top_content', coalesce((
        select jsonb_agg(x)
        from (
          select jsonb_build_object('job_id', jx.id, 'title', jx.title, 'channel', jx.channel, 'url', jx.external_url,
            'published_at', jx.published_at, 'metrics', pm.metrics, 'fetched_at', pm.fetched_at,
            'engagement', (select coalesce(sum((v.value)::numeric), 0) from jsonb_each_text(pm.metrics) v where v.value ~ '^\d+$')) x
          from j_in jx join public.publishing_metrics pm on pm.job_id = jx.id
          where jx.status = 'PUBLISHED' and pm.status = 'OK'
          order by (select coalesce(sum((v.value)::numeric), 0) from jsonb_each_text(pm.metrics) v where v.value ~ '^\d+$') desc, jx.published_at desc
          limit 5
        ) t
      ), '[]'::jsonb),
      'recent_published', coalesce((
        select jsonb_agg(x)
        from (
          select jsonb_build_object('job_id', id, 'title', title, 'channel', channel, 'url', external_url, 'published_at', published_at) x
          from j_in where status = 'PUBLISHED' order by published_at desc limit 5
        ) t
      ), '[]'::jsonb),
      'metrics_refreshed_at', (select max(fetched_at) from public.publishing_metrics where owner_id = v_uid)
    )
  );
end;
$$;

revoke execute on function public.analytics_job_time(public.publishing_jobs) from public, anon;
revoke execute on function public.analytics_business_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_job_time(public.publishing_jobs) to authenticated;
grant execute on function public.analytics_business_overview(timestamptz, timestamptz) to authenticated;

-- Engagement snapshots: written by the server only (publishing secret), for the caller's own jobs.
create or replace function public.publishing_save_metrics(p_secret text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.publishing_assert_server(p_secret);
  if (select auth.uid()) is null then
    raise exception 'publishing:not_signed_in' using errcode = '42501';
  end if;
  insert into public.publishing_metrics as pm (job_id, owner_id, channel, status, metrics, fetched_at)
  select j.id, j.owner_id, j.channel, r ->> 'status', coalesce(r -> 'metrics', '{}'::jsonb), now()
  from jsonb_array_elements(p_rows) r
  join public.publishing_jobs j on j.id = (r ->> 'job_id')::uuid
  where j.owner_id = (select auth.uid()) and j.status = 'PUBLISHED'
  on conflict (job_id) do update set status = excluded.status, metrics = excluded.metrics, fetched_at = excluded.fetched_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.publishing_save_metrics(text, jsonb) from public, anon;
grant execute on function public.publishing_save_metrics(text, jsonb) to authenticated;
