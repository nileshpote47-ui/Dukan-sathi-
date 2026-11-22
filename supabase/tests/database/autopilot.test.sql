-- Phase 9: Premium Autopilot. Plan data, owner-only settings and decisions, generator functions behind the
-- server secret, run once per week, credits reserved/committed/released. Run locally with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('81111111-1111-1111-1111-111111111111', 'ap-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('82222222-2222-2222-2222-222222222222', 'ap-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '81111111-1111-1111-1111-111111111111', 'AP A Kirana', 'grocery', now()),
  ('8bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '82222222-2222-2222-2222-222222222222', 'AP B Mobiles', 'mobile_shop', now());
insert into public.business_subscriptions (business_id, owner_id, plan_id, status, provider, provider_subscription_id, current_period_start, current_period_end)
values ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '81111111-1111-1111-1111-111111111111', (select id from public.billing_plans where slug = 'premium'),
  'ACTIVE', 'mock', 'pgtap-ap-premium', now(), now() + interval '1 day');

select results_eq(
  $$ select slug, autopilot_posts_per_week from public.billing_plans where slug in ('free', 'starter', 'growth', 'premium') order by sort_order $$,
  $$ values ('free'::text, 0), ('starter'::text, 0), ('growth'::text, 0), ('premium'::text, 5) $$,
  'Autopilot is a Premium feature: 5 posts a week'
);

-- Owners write their own settings only; the weekly marker cannot be set by them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "81111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok(
  $$ insert into public.autopilot_settings (business_id, owner_id, enabled, account_ids, last_run_week)
     values ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '81111111-1111-1111-1111-111111111111', true, array[gen_random_uuid()], '2026-11-23') $$,
  'owner turns Autopilot on'
);
select is((select last_run_week from public.autopilot_settings), null, 'the weekly marker set by the owner is ignored');
select throws_ok(
  $$ insert into public.autopilot_settings (business_id, owner_id) values ('8bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '81111111-1111-1111-1111-111111111111') $$,
  null, null, 'not for someone else''s business'
);
select throws_ok($$ select * from public.autopilot_due('x', '2026-11-23') $$, '42501', null, 'generator functions need the server secret');
reset role;

-- The generator (server secret): due list, once-per-week reservation, save.
create temp table secret as select decrypted_secret as v from vault.decrypted_secrets where name = 'publishing_server_secret';
select is((select count(*)::int from public.autopilot_due((select v from secret), '2026-11-23') d where d.business_id = '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'a Premium shop with Autopilot on is due');
create temp table res as select public.autopilot_begin((select v from secret), '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-23', 2) as ids;
select is((select cardinality(ids) from res), 2, 'two AI posts reserved');
select is(cardinality(public.autopilot_begin((select v from secret), '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-23', 2)), 0, 'the same week never runs twice');
select is(
  public.autopilot_save((select v from secret), '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-23',
    '[{"slot": 1, "planned_for": "2026-11-23T04:30:00Z", "title": "Weekly savings", "content_type": "OFFER", "language": "en", "description": "x", "offer_text": "Cashews ₹899/kg", "generated_copy": {"headline": "Savings"}, "ai_provider": "mock", "ai_model": "m", "idea": {"kind": "category"}}]'::jsonb,
    (select ids[1:1] from res), (select ids[2:2] from res)),
  1, 'one post saved as draft content'
);
select results_eq(
  $$ select state from public.usage_ledger where id in (select unnest(ids) from res) order by state $$,
  $$ values ('COMMITTED'::text), ('RELEASED'::text) $$,
  'the used credit is committed, the unused one released'
);

-- Owner B sees nothing; owner A may only decide once.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "82222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.autopilot_posts), 0, 'another owner sees no Autopilot posts');
select set_config('request.jwt.claims', '{"sub": "81111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
update public.autopilot_posts set status = 'SKIPPED';
select throws_ok($$ update public.autopilot_posts set status = 'PENDING' $$, '23514', null, 'a decision cannot be undone');

select * from finish();
rollback;
