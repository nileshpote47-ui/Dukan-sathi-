-- Phase 9: direct posters are a metered feature with per-plan limits (Free 3, Starter 30, Growth 70).
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('61111111-1111-1111-1111-111111111111', 'dp-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('62222222-2222-2222-2222-222222222222', 'dp-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('6aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '61111111-1111-1111-1111-111111111111', 'DP A Kirana', 'grocery', now()),
  ('6bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '62222222-2222-2222-2222-222222222222', 'DP B Mobiles', 'mobile_shop', now());

select results_eq(
  $$ select p.slug, e.monthly_limit from public.plan_entitlements e join public.billing_plans p on p.id = e.plan_id
     where e.feature_key = 'direct_poster' order by e.monthly_limit $$,
  $$ values ('free'::text, 3), ('starter'::text, 30), ('growth'::text, 70) $$,
  'direct poster limits per plan: Free 3, Starter 30, Growth 70'
);

-- Owner A on the Free plan: three direct posters, then the limit.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "61111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select isnt(public.billing_reserve_usage('direct_poster', 'content_item', 'x1'), null, 'first direct poster can be reserved');
select lives_ok($$ select public.billing_commit_usage(public.billing_reserve_usage('direct_poster', 'content_item', 'x2')) $$, 'second is reserved and committed');
select lives_ok($$ select public.billing_release_usage(public.billing_reserve_usage('direct_poster', 'content_item', 'x3')) $$, 'a failed poster releases its credit');
select isnt(public.billing_reserve_usage('direct_poster', 'content_item', 'x4'), null, 'the released credit can be used again');
select throws_ok($$ select public.billing_reserve_usage('direct_poster') $$, 'P0001', 'billing:limit_reached', 'the fourth poster on Free is refused');
select is((select remaining from public.billing_usage_summary() where feature_key = 'direct_poster'), 0, 'usage summary shows none left');

-- Owner B is not affected by A's usage.
select set_config('request.jwt.claims', '{"sub": "62222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select remaining from public.billing_usage_summary() where feature_key = 'direct_poster'), 3, 'another business has its own three');
select throws_ok($$ select public.billing_reserve_usage('direct_posterx') $$, '22023', null, 'unknown features are still rejected');

select * from finish();
rollback;
