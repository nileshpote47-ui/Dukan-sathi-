-- Phase 7: owner analytics, engagement snapshots, admin authorization + audit.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'an-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'an-b@test.local', 'authenticated', 'authenticated', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'an-admin@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Analytics A Kirana', 'grocery', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Analytics B Mobiles', 'mobile_shop', now());
insert into public.admin_users (user_id, note) values ('33333333-3333-3333-3333-333333333333', 'test admin');

-- Owner A: two items this month (one OFFER in Marathi), one 40 days ago. Owner B: one item.
insert into public.content_items (id, business_id, owner_id, title, content_type, language, description, created_at) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Offer', 'OFFER', 'mr', 'x', now() - interval '1 day'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Post', 'POST', 'en', 'x', now() - interval '2 days'),
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Old', 'POST', 'en', 'x', now() - interval '40 days'),
  ('c4444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B post', 'POST', 'hi', 'x', now() - interval '1 day');
insert into public.publishing_jobs (id, business_id, owner_id, content_item_id, channel, status, publish_mode, title, scheduled_for, published_at, last_attempt_at, external_post_id) values
  ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'FACEBOOK', 'PUBLISHED', 'SCHEDULED', 'Offer', now() - interval '1 day' - interval '2 minutes', now() - interval '1 day', now() - interval '1 day', 'fb_1'),
  ('d2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222', 'INSTAGRAM', 'FAILED', 'NOW', 'Post', now() - interval '2 days', null, now() - interval '2 days', null),
  ('d3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'c4444444-4444-4444-4444-444444444444', 'FACEBOOK', 'PUBLISHED', 'NOW', 'B post', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', 'fb_b');
insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type, state, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ai_text_generation', public.billing_period_start(), -1, 'USAGE', 'COMMITTED', now() - interval '1 day'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ai_text_generation', public.billing_period_start(), -1, 'USAGE', 'RELEASED', now() - interval '1 day');

do $$
begin
  if exists (select 1 from vault.secrets where name = 'publishing_server_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'publishing_server_secret'), 'test-server-secret-0123456789abcdef0123456789');
  else
    perform vault.create_secret('test-server-secret-0123456789abcdef0123456789', 'publishing_server_secret');
  end if;
end $$;

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.admin_users'::regclass, 'public.admin_audit_logs'::regclass, 'public.publishing_metrics'::regclass)),
  'RLS is on for admin and engagement tables');

-- ---------------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq($$ select (public.analytics_business_overview(now() - interval '30 days', now()) -> 'content' ->> 'created')::int $$,
  $$ values (2) $$, 'content created counts only the selected dates');
select results_eq($$ select (public.analytics_business_overview(now() - interval '60 days', now()) -> 'content' ->> 'created')::int $$,
  $$ values (3) $$, 'a longer range includes older content');
select results_eq($$ select public.analytics_business_overview(now() - interval '30 days', now()) -> 'content' -> 'by_type' $$,
  $$ values ('{"OFFER": 1, "POST": 1}'::jsonb) $$, 'content breakdown by type');
select results_eq($$ select public.analytics_business_overview(now() - interval '30 days', now()) -> 'content' -> 'by_language' $$,
  $$ values ('{"en": 1, "mr": 1}'::jsonb) $$, 'content breakdown by language');
select results_eq($$ select (p ->> 'published')::int, (p ->> 'failed')::int from (select public.analytics_business_overview(now() - interval '30 days', now()) -> 'publishing' p) x $$,
  $$ values (1, 1) $$, 'publishing counts published and failed jobs of the owner only');
select results_eq($$ select (public.analytics_business_overview(now() - interval '30 days', now()) -> 'publishing' ->> 'avg_delay_seconds')::int $$,
  $$ values (120) $$, 'scheduled posts report their delay from the planned time');
select results_eq($$ select public.analytics_business_overview(now() - interval '30 days', now()) -> 'usage' -> 'ai_text_generation' $$,
  $$ values ('{"used": 1, "failed": 1}'::jsonb) $$, 'usage separates charged and failed (not charged) operations');
select results_eq($$ select jsonb_array_length(public.analytics_business_overview((date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '7 days') at time zone 'Asia/Kolkata', date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') -> 'daily') $$,
  $$ values (7) $$, 'the daily series has one point per India day in the range');
select results_eq($$ select (public.analytics_business_overview(now() - interval '1 hour', now()) -> 'content' ->> 'created')::int $$,
  $$ values (0) $$, 'an empty range returns zero, not other periods');
select throws_ok($$ select public.analytics_business_overview(now(), now() - interval '1 day') $$, '22023', 'analytics:invalid_range', 'an inverted range is refused');
select throws_ok($$ select public.analytics_business_overview(now() - interval '400 days', now()) $$, '22023', 'analytics:invalid_range', 'ranges longer than a year are refused');

select throws_ok($$ select * from public.admin_users $$, '42501', null, 'owners cannot read the admin list');
select throws_ok($$ select * from public.admin_audit_logs $$, '42501', null, 'owners cannot read the audit log');
select throws_ok($$ insert into public.publishing_metrics (job_id, owner_id, channel, status, metrics) values ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'FACEBOOK', 'OK', '{"likes": 999}') $$,
  '42501', null, 'owners cannot write engagement numbers themselves');
select throws_ok($$ select public.publishing_save_metrics('nope-nope-nope-nope-nope-nope-nope-nope', '[]') $$, '42501', 'publishing:forbidden', 'saving numbers needs the server secret');
select results_eq($$ select public.publishing_save_metrics('test-server-secret-0123456789abcdef0123456789',
  '[{"job_id": "d1111111-1111-1111-1111-111111111111", "status": "OK", "metrics": {"reactions": 7, "comments": 2}},
    {"job_id": "d3333333-3333-3333-3333-333333333333", "status": "OK", "metrics": {"reactions": 500}}]') $$,
  $$ values (1) $$, 'the server stores numbers only for the owner''s own published jobs');
select results_eq($$ select (x ->> 'engagement')::int, x ->> 'title' from jsonb_array_elements(public.analytics_business_overview(now() - interval '30 days', now()) -> 'top_content') x $$,
  $$ values (9, 'Offer'::text) $$, 'top content uses real platform numbers');

select results_eq($$ select public.admin_is_admin() $$, $$ values (false) $$, 'a business owner is not an admin');
select throws_ok($$ select public.admin_overview(now() - interval '30 days', now()) $$, '42501', 'admin:forbidden', 'owners cannot open the admin overview');
select throws_ok($$ select public.admin_list_businesses(null, null, null, 20, 0) $$, '42501', 'admin:forbidden', 'owners cannot list businesses');
select throws_ok($$ select public.admin_business_detail('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$, '42501', 'admin:forbidden', 'owners cannot open another business');
select throws_ok($$ select public.admin_authorize('ADMIN_VIEW_SYSTEM') $$, '42501', null, 'the admin check itself cannot be called directly');
reset role;

-- ---------------------------------------------------------------------------
-- Owner B: isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select results_eq($$ select (o -> 'content' ->> 'created')::int, (o -> 'publishing' ->> 'published')::int, jsonb_array_length(o -> 'top_content')
  from (select public.analytics_business_overview(now() - interval '30 days', now()) o) x $$,
  $$ values (1, 1, 0) $$, 'owner B sees only their own content, publishing and numbers');
select is_empty($$ select job_id from public.publishing_metrics $$, 'owner B cannot read owner A''s engagement numbers');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select public.analytics_business_overview(now() - interval '30 days', now()) $$, '42501', null, 'anonymous visitors get no analytics');
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select results_eq($$ select (public.admin_overview(now() - interval '30 days', now()) ->> 'businesses')::int >= 2 $$, $$ values (true) $$, 'an admin sees system-wide totals');
select results_eq($$ select (r ->> 'total')::int, r -> 'rows' -> 0 ->> 'name' from (select public.admin_list_businesses('Analytics A', null, null, 20, 0) r) x $$,
  $$ values (1, 'Analytics A Kirana'::text) $$, 'businesses can be searched');
select results_eq($$ select jsonb_array_length(public.admin_list_businesses('Analytics', null, null, 1, 0) -> 'rows') $$, $$ values (1) $$, 'admin lists are paginated');
select results_eq($$ select public.admin_business_detail('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'business' ->> 'name' $$,
  $$ values ('Analytics A Kirana'::text) $$, 'an admin can open a business summary');
reset role;
select results_eq($$ select action, target_id from public.admin_audit_logs where actor_id = '33333333-3333-3333-3333-333333333333' and action = 'ADMIN_VIEW_BUSINESS' $$,
  $$ values ('ADMIN_VIEW_BUSINESS'::text, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::text) $$, 'admin views are recorded with actor, action and target');

select * from finish();
rollback;
