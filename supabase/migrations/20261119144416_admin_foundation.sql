-- Phase 7: admin foundation (explicit admin list, audited read-only admin functions).
-- Tables admin_users and admin_audit_logs are created in the analytics migration before this one.

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
$$;

-- Check admin access and record the view (actor, action, target, filters).
create or replace function public.admin_authorize(p_action text, p_target_type text default null, p_target_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'admin:forbidden' using errcode = '42501';
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), p_action, p_target_type, left(p_target_id, 100), coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_authorize('ADMIN_VIEW_OVERVIEW', null, null, jsonb_build_object('from', p_from, 'to', p_to));
  if p_to <= p_from or p_to - p_from > interval '367 days' then
    raise exception 'analytics:invalid_range' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_new', (select count(*) from auth.users where created_at >= p_from and created_at < p_to),
    'businesses', (select count(*) from public.businesses),
    'businesses_onboarded', (select count(*) from public.businesses where onboarding_completed_at is not null),
    -- Active = created content, used a metered feature or published in the period.
    'businesses_active', (
      select count(distinct b) from (
        select business_id b from public.content_items where created_at >= p_from and created_at < p_to
        union select business_id from public.usage_ledger where transaction_type = 'USAGE' and created_at >= p_from and created_at < p_to
        union select business_id from public.publishing_jobs where created_at >= p_from and created_at < p_to
      ) x
    ),
    'connected_accounts', coalesce((select jsonb_object_agg(channel, n) from (select channel, count(*) n from public.social_accounts where status = 'CONNECTED' group by 1) s), '{}'::jsonb),
    'accounts_need_attention', (select count(*) from public.social_accounts where status in ('EXPIRED', 'REVOKED', 'ERROR')),
    'subscriptions_active', coalesce((
      select jsonb_object_agg(p.slug, n) from (
        select s.plan_id, count(*) n from public.business_subscriptions s
        where s.status = 'ACTIVE' and s.current_period_end > now() - interval '1 day' group by 1
      ) x join public.billing_plans p on p.id = x.plan_id
    ), '{}'::jsonb),
    'jobs', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.publishing_jobs where created_at >= p_from and created_at < p_to group by 1) s), '{}'::jsonb),
    'usage', coalesce((
      select jsonb_object_agg(feature_key, jsonb_build_object('used', used, 'failed', failed)) from (
        select feature_key, count(*) filter (where state = 'COMMITTED') used, count(*) filter (where state = 'RELEASED') failed
        from public.usage_ledger where transaction_type = 'USAGE' and created_at >= p_from and created_at < p_to group by 1
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.admin_list_businesses(p_search text, p_category text, p_plan text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(p_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_authorize('ADMIN_VIEW_BUSINESSES', null, null,
    jsonb_build_object('search', left(v_search, 60), 'category', p_category, 'plan', p_plan, 'offset', v_offset));
  return (
    with base as (
      select b.id, b.business_name, b.business_category, b.district, b.state, b.created_at, b.onboarding_completed_at,
        coalesce((select p.slug from public.billing_entitling_subscription(b.id) es join public.billing_plans p on p.id = es.plan_id where es.id is not null), 'free') as plan
      from public.businesses b
      where (v_search is null or b.business_name ilike '%' || v_search || '%' or b.district ilike '%' || v_search || '%' or b.id::text = v_search)
        and (p_category is null or b.business_category = p_category)
    ), filtered as (
      select * from base where p_plan is null or plan = p_plan
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'name', f.business_name, 'category', f.business_category, 'district', f.district, 'state', f.state,
          'plan', f.plan, 'created_at', f.created_at, 'onboarded', f.onboarding_completed_at is not null,
          'content', (select count(*) from public.content_items c where c.business_id = f.id),
          'published', (select count(*) from public.publishing_jobs j where j.business_id = f.id and j.status = 'PUBLISHED'),
          'channels', (select count(*) from public.social_accounts a where a.business_id = f.id and a.status = 'CONNECTED')
        ) order by f.created_at desc)
        from (select * from filtered order by created_at desc limit v_limit offset v_offset) f
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_business_detail(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.businesses%rowtype;
begin
  perform public.admin_authorize('ADMIN_VIEW_BUSINESS', 'business', p_business_id::text);
  select * into v_b from public.businesses where id = p_business_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'business', jsonb_build_object('id', v_b.id, 'name', v_b.business_name, 'category', v_b.business_category,
      'district', v_b.district, 'state', v_b.state, 'created_at', v_b.created_at, 'onboarded_at', v_b.onboarding_completed_at,
      'owner_id', v_b.owner_id, 'owner_email', (select u.email from auth.users u where u.id = v_b.owner_id)),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('plan', p.slug, 'status', s.status, 'provider', s.provider,
        'period_start', s.current_period_start, 'period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'created_at', s.created_at) order by s.created_at desc)
      from public.business_subscriptions s join public.billing_plans p on p.id = s.plan_id where s.business_id = v_b.id
    ), '[]'::jsonb),
    'payments', (select jsonb_build_object('captured', count(*) filter (where status = 'CAPTURED'),
      'captured_paise', coalesce(sum(amount_paise) filter (where status = 'CAPTURED'), 0), 'failed', count(*) filter (where status = 'FAILED'))
      from public.billing_payments where business_id = v_b.id),
    'usage_this_month', coalesce((
      select jsonb_object_agg(feature_key, jsonb_build_object('used', used, 'failed', failed)) from (
        select feature_key, count(*) filter (where state = 'COMMITTED') used, count(*) filter (where state = 'RELEASED') failed
        from public.usage_ledger where business_id = v_b.id and transaction_type = 'USAGE' and period_start = public.billing_period_start()
        group by 1
      ) s
    ), '{}'::jsonb),
    'content', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.content_items where business_id = v_b.id group by 1) s), '{}'::jsonb),
    'publishing', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.publishing_jobs where business_id = v_b.id group by 1) s), '{}'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('channel', channel, 'name', external_account_name, 'status', status, 'connected_at', connected_at) order by channel)
      from public.social_accounts where business_id = v_b.id
    ), '[]'::jsonb),
    'media', (select jsonb_build_object('ready', count(*) filter (where status = 'READY'), 'failed', count(*) filter (where status = 'FAILED'))
      from public.media_assets where business_id = v_b.id)
  );
end;
$$;

create or replace function public.admin_list_users(p_search text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(p_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_authorize('ADMIN_VIEW_USERS', null, null, jsonb_build_object('search', left(v_search, 60), 'offset', v_offset));
  return (
    with filtered as (
      select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
      from auth.users u
      where v_search is null or u.email ilike '%' || v_search || '%' or u.id::text = v_search
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'email', f.email, 'created_at', f.created_at, 'last_sign_in_at', f.last_sign_in_at,
          'confirmed', f.email_confirmed_at is not null, 'banned', f.banned_until is not null and f.banned_until > now(),
          'is_admin', exists (select 1 from public.admin_users a where a.user_id = f.id),
          'business', (select jsonb_build_object('id', b.id, 'name', b.business_name) from public.businesses b where b.owner_id = f.id order by b.created_at limit 1)
        ) order by f.created_at desc)
        from (select * from filtered order by created_at desc limit v_limit offset v_offset) f
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_authorize('ADMIN_VIEW_USER', 'user', p_user_id::text);
  return (
    select jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'confirmed', u.email_confirmed_at is not null, 'banned', u.banned_until is not null and u.banned_until > now(),
      'is_admin', exists (select 1 from public.admin_users a where a.user_id = u.id),
      'language', (select p.preferred_language from public.profiles p where p.user_id = u.id),
      'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.business_name, 'category', b.business_category, 'onboarded', b.onboarding_completed_at is not null)) from public.businesses b where b.owner_id = u.id), '[]'::jsonb),
      'activity', jsonb_build_object(
        'content', (select count(*) from public.content_items c where c.owner_id = u.id),
        'content_30d', (select count(*) from public.content_items c where c.owner_id = u.id and c.created_at > now() - interval '30 days'),
        'published', (select count(*) from public.publishing_jobs j where j.owner_id = u.id and j.status = 'PUBLISHED'),
        'ai_30d', (select count(*) from public.usage_ledger l where l.owner_id = u.id and l.transaction_type = 'USAGE' and l.state = 'COMMITTED' and l.feature_key = 'ai_text_generation' and l.created_at > now() - interval '30 days')
      )
    )
    from auth.users u where u.id = p_user_id
  );
end;
$$;

create or replace function public.admin_subscriptions(p_status text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_authorize('ADMIN_VIEW_BILLING', null, null, jsonb_build_object('status', p_status, 'offset', v_offset));
  return jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.business_subscriptions group by 1) s), '{}'::jsonb),
    'by_plan_active', coalesce((
      select jsonb_object_agg(p.slug, x.n) from (
        select plan_id, count(*) n from public.business_subscriptions where status = 'ACTIVE' and current_period_end > now() - interval '1 day' group by 1
      ) x join public.billing_plans p on p.id = x.plan_id
    ), '{}'::jsonb),
    'businesses_total', (select count(*) from public.businesses),
    'payments', (select jsonb_build_object('captured', count(*) filter (where status = 'CAPTURED'),
      'captured_paise', coalesce(sum(amount_paise) filter (where status = 'CAPTURED'), 0), 'failed', count(*) filter (where status = 'FAILED'))
      from public.billing_payments),
    'total', (select count(*) from public.business_subscriptions where p_status is null or status = p_status),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('business_id', s.business_id, 'business', b.business_name, 'plan', p.slug, 'status', s.status,
        'provider', s.provider, 'period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'updated_at', s.updated_at)
        order by s.updated_at desc)
      from (select * from public.business_subscriptions where p_status is null or status = p_status order by updated_at desc limit v_limit offset v_offset) s
      left join public.businesses b on b.id = s.business_id
      join public.billing_plans p on p.id = s.plan_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_usage(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_authorize('ADMIN_VIEW_USAGE', null, null, jsonb_build_object('from', p_from, 'to', p_to));
  if p_to <= p_from or p_to - p_from > interval '367 days' then
    raise exception 'analytics:invalid_range' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'by_feature', coalesce((
      select jsonb_object_agg(feature_key, jsonb_build_object('used', used, 'failed', failed, 'businesses', businesses)) from (
        select feature_key, count(*) filter (where state = 'COMMITTED') used, count(*) filter (where state = 'RELEASED') failed,
          count(distinct business_id) filter (where state = 'COMMITTED') businesses
        from public.usage_ledger where transaction_type = 'USAGE' and created_at >= p_from and created_at < p_to group by 1
      ) s
    ), '{}'::jsonb),
    'top_businesses', coalesce((
      select jsonb_agg(jsonb_build_object('business_id', x.business_id, 'business', b.business_name, 'used', x.used) order by x.used desc)
      from (
        select business_id, count(*) used from public.usage_ledger
        where transaction_type = 'USAGE' and state = 'COMMITTED' and created_at >= p_from and created_at < p_to and business_id is not null
        group by 1 order by 2 desc limit 10
      ) x left join public.businesses b on b.id = x.business_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_publishing(p_status text, p_channel text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_authorize('ADMIN_VIEW_PUBLISHING', null, null, jsonb_build_object('status', p_status, 'channel', p_channel, 'offset', v_offset));
  return jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.publishing_jobs group by 1) s), '{}'::jsonb),
    'by_channel_failed_7d', coalesce((select jsonb_object_agg(channel, n) from (
      select channel, count(*) n from public.publishing_jobs where status = 'FAILED' and updated_at > now() - interval '7 days' group by 1) s), '{}'::jsonb),
    'total', (select count(*) from public.publishing_jobs where (p_status is null or status = p_status) and (p_channel is null or channel = p_channel)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'business_id', j.business_id, 'business', b.business_name, 'channel', j.channel,
        'provider', a.provider, 'status', j.status, 'attempts', j.attempt_count, 'error_code', j.error_code, 'error_message', j.error_message,
        'created_at', j.created_at, 'scheduled_for', j.scheduled_for, 'published_at', j.published_at) order by j.created_at desc)
      from (
        select * from public.publishing_jobs
        where (p_status is null or status = p_status) and (p_channel is null or channel = p_channel)
        order by created_at desc limit v_limit offset v_offset
      ) j
      left join public.businesses b on b.id = j.business_id
      left join public.social_accounts a on a.id = j.social_account_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_system(p_hours integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
begin
  perform public.admin_authorize('ADMIN_VIEW_SYSTEM', null, null, jsonb_build_object('hours', p_hours));
  return jsonb_build_object(
    'since', v_since,
    'publishing_failures', coalesce((
      select jsonb_agg(jsonb_build_object('at', a.finished_at, 'channel', j.channel, 'provider', s.provider, 'error_code', a.error_code,
        'error_message', a.error_message, 'business', b.business_name) order by a.finished_at desc)
      from (select * from public.publishing_attempts where outcome = 'FAILED' and finished_at >= v_since order by finished_at desc limit 20) a
      join public.publishing_jobs j on j.id = a.job_id
      left join public.social_accounts s on s.id = j.social_account_id
      left join public.businesses b on b.id = j.business_id
    ), '[]'::jsonb),
    'publishing_failures_by_code', coalesce((select jsonb_object_agg(error_code, n) from (
      select coalesce(error_code, 'UNKNOWN_ERROR') error_code, count(*) n from public.publishing_attempts where outcome = 'FAILED' and finished_at >= v_since group by 1) s), '{}'::jsonb),
    'stuck_sending', (select count(*) from public.publishing_jobs where status = 'SENDING' and started_at < now() - interval '10 minutes'),
    'billing_webhooks', coalesce((select jsonb_object_agg(status, n) from (
      select status, count(*) n from public.billing_webhook_events where received_at >= v_since group by 1) s), '{}'::jsonb),
    'billing_webhook_failures', coalesce((
      select jsonb_agg(jsonb_build_object('at', received_at, 'provider', provider, 'event_type', event_type, 'status', status, 'error', left(error, 200)) order by received_at desc)
      from (select * from public.billing_webhook_events where status = 'FAILED' and received_at >= v_since order by received_at desc limit 10) e
    ), '[]'::jsonb),
    'meta_webhooks', coalesce((select jsonb_object_agg(status, n) from (
      select status, count(*) n from public.publishing_webhook_events where received_at >= v_since group by 1) s), '{}'::jsonb),
    -- Failed metered operations (AI text, pictures, storyboards, posters, publishing): reservations released.
    'failed_operations', coalesce((select jsonb_object_agg(feature_key, n) from (
      select feature_key, count(*) n from public.usage_ledger where transaction_type = 'USAGE' and state = 'RELEASED' and created_at >= v_since group by 1) s), '{}'::jsonb),
    'media_failures', (select count(*) from public.media_assets where status = 'FAILED' and created_at >= v_since),
    'scheduler', (
      select jsonb_build_object('last_run', max(d.start_time), 'failed_runs', count(*) filter (where d.status <> 'succeeded'))
      from cron.job_run_details d join cron.job c on c.jobid = d.jobid
      where c.jobname = 'publishing-runner' and d.start_time >= v_since
    ),
    'recent_admin_actions', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.created_at, 'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id,
        'actor', (select u.email from auth.users u where u.id = l.actor_id)) order by l.created_at desc)
      from (select * from public.admin_audit_logs order by created_at desc limit 20) l
    ), '[]'::jsonb)
  );
end;
$$;

-- Privileges: admin functions are callable by signed-in users but refuse everyone not in admin_users.
revoke execute on function public.admin_authorize(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_is_admin() from public, anon;
revoke execute on function public.admin_overview(timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_list_businesses(text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_business_detail(uuid) from public, anon;
revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_subscriptions(text, integer, integer) from public, anon;
revoke execute on function public.admin_usage(timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_publishing(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_system(integer) from public, anon;
grant execute on function public.admin_is_admin() to authenticated;
grant execute on function public.admin_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_list_businesses(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_business_detail(uuid) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_subscriptions(text, integer, integer) to authenticated;
grant execute on function public.admin_usage(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_publishing(text, text, integer, integer) to authenticated;
grant execute on function public.admin_system(integer) to authenticated;
