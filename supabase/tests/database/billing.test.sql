-- Phase 5: plans, entitlements, usage ledger, subscriptions, payments and signed webhooks.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back (including the test Vault secret).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'bill-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'bill-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop', now());

-- Small image limit on the free plan for limit tests (rolled back).
update public.plan_entitlements set monthly_limit = 1
where feature_key = 'image_generation' and plan_id = (select id from public.billing_plans where slug = 'free');

-- Test webhook secret and signed events (created as postgres; anon only reads this temp table).
select vault.create_secret('test-webhook-secret', 'mock_webhook_secret');
create temp table ev (name text primary key, event_id text, body text, sig text);
grant select on ev to anon, authenticated;
insert into ev (name, event_id, body)
select name, event_id, body from (values
  ('activated', 'evt_1', jsonb_build_object('event', 'subscription.activated', 'created_at', extract(epoch from now())::bigint,
    'payload', jsonb_build_object(
      'subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_A1', 'status', 'active',
        'current_start', extract(epoch from now())::bigint, 'current_end', extract(epoch from now() + interval '30 days')::bigint,
        'notes', jsonb_build_object('business_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'plan_slug', 'starter'))),
      'payment', jsonb_build_object('entity', jsonb_build_object('id', 'pay_1', 'amount', 19900, 'currency', 'INR', 'status', 'captured',
        'created_at', extract(epoch from now())::bigint))))::text),
  ('late_pending', 'evt_0', jsonb_build_object('event', 'subscription.pending', 'created_at', extract(epoch from now() - interval '1 hour')::bigint,
    'payload', jsonb_build_object('subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_A1', 'status', 'pending',
      'notes', '[]'::jsonb))))::text),
  ('charged', 'evt_2', jsonb_build_object('event', 'subscription.charged', 'created_at', extract(epoch from now() + interval '30 days')::bigint,
    'payload', jsonb_build_object(
      'subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_A1', 'status', 'active',
        'current_start', extract(epoch from now() + interval '30 days')::bigint, 'current_end', extract(epoch from now() + interval '60 days')::bigint,
        'notes', jsonb_build_object('business_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'plan_slug', 'starter'))),
      'payment', jsonb_build_object('entity', jsonb_build_object('id', 'pay_2', 'amount', 19900, 'currency', 'INR', 'status', 'captured')))))::text),
  ('upgrade', 'evt_3', jsonb_build_object('event', 'subscription.activated', 'created_at', extract(epoch from now() + interval '31 days')::bigint,
    'payload', jsonb_build_object('subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_A2', 'status', 'active',
      'current_start', extract(epoch from now() + interval '31 days')::bigint, 'current_end', extract(epoch from now() + interval '61 days')::bigint,
      'notes', jsonb_build_object('business_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'plan_slug', 'growth'))))))::text),
  ('cancelled', 'evt_4', jsonb_build_object('event', 'subscription.cancelled', 'created_at', extract(epoch from now() + interval '32 days')::bigint,
    'payload', jsonb_build_object('subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_A1', 'status', 'cancelled',
      'notes', '[]'::jsonb)))))::text),
  ('unknown_business', 'evt_5', jsonb_build_object('event', 'subscription.activated', 'created_at', extract(epoch from now())::bigint,
    'payload', jsonb_build_object('subscription', jsonb_build_object('entity', jsonb_build_object('id', 'sub_X', 'status', 'active',
      'notes', jsonb_build_object('business_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'plan_slug', 'growth'))))))::text),
  ('other_event', 'evt_6', jsonb_build_object('event', 'payment.captured', 'created_at', extract(epoch from now())::bigint, 'payload', '{}'::jsonb)::text)
) as t (name, event_id, body);
update ev set sig = encode(extensions.hmac(convert_to(body, 'UTF8'), convert_to('test-webhook-secret', 'UTF8'), 'sha256'), 'hex');

-- Plans (public reference data) --------------------------------------------------------
set local role anon;
select results_eq($$ select slug from public.billing_plans order by sort_order $$, $$ values ('free'::text), ('starter'), ('growth') $$,
  'anyone can read the three plans, free first');
select results_eq($$ select count(*)::int from public.plan_entitlements $$, $$ values (12) $$, 'each plan has the four metered features');
select throws_ok($$ update public.billing_plans set price_paise = 1 $$, '42501', null, 'anonymous users cannot change prices');
reset role;

-- Usage as owner A ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok($$ update public.billing_plans set price_paise = 1 where slug = 'starter' $$, '42501', null, 'owners cannot change plan prices');
select throws_ok($$ insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ai_text_generation', current_date, 1000, 'BONUS') $$,
  '42501', null, 'owners cannot add credits directly');
select throws_ok($$ insert into public.business_subscriptions (business_id, owner_id, plan_id, status, provider, provider_subscription_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', (select id from public.billing_plans where slug = 'growth'), 'ACTIVE', 'mock', 'fake') $$,
  '42501', null, 'owners cannot create subscriptions directly');
select throws_ok($$ insert into public.billing_payments (provider, provider_payment_id, amount_paise, currency, status)
  values ('mock', 'fake', 49900, 'INR', 'CAPTURED') $$, '42501', null, 'owners cannot mark payments as successful');
select throws_ok($$ select public.billing_apply_subscription_event('mock', '{}'::jsonb) $$, '42501', null, 'internal webhook logic is not callable');

select isnt(public.billing_reserve_usage('ai_text_generation', 'test', '1'), null, 'reserving usage returns a reservation');
select lives_ok($$ select public.billing_commit_usage((select id from public.usage_ledger where transaction_type = 'USAGE' and state = 'PENDING' limit 1)) $$,
  'a reservation can be committed after success');
select results_eq($$ select monthly_limit, used, remaining from public.billing_usage_summary() where feature_key = 'ai_text_generation' $$,
  $$ values (30, 1, 29) $$, 'free plan: 30 AI texts, 1 used, 29 left');
select results_eq($$ select count(*)::int from public.usage_ledger where transaction_type = 'ALLOCATION' and feature_key = 'ai_text_generation' $$,
  $$ values (1) $$, 'the monthly allowance is allocated once');

-- Failed operation: released, not charged; a released reservation cannot be committed.
select lives_ok($$ select public.billing_release_usage(public.billing_reserve_usage('ai_text_generation')) $$, 'a failed operation releases its reservation');
select results_eq($$ select used, reserved, remaining from public.billing_usage_summary() where feature_key = 'ai_text_generation' $$,
  $$ values (1, 0, 29) $$, 'a released reservation is not charged');
select throws_ok($$ select public.billing_commit_usage((select id from public.usage_ledger where state = 'RELEASED' limit 1)) $$,
  'P0001', 'billing:usage_not_pending', 'a released reservation cannot be committed');

-- Limits: the last credit can be taken once; no negative balance.
select isnt(public.billing_reserve_usage('image_generation'), null, 'the last image credit can be reserved');
select throws_ok($$ select public.billing_reserve_usage('image_generation') $$, 'P0001', 'billing:limit_reached', 'the limit is enforced server-side');
select results_eq($$ select sum(amount)::int from public.usage_ledger where feature_key = 'image_generation' and state <> 'RELEASED' $$,
  $$ values (0) $$, 'the balance never goes below zero');
select throws_ok($$ select public.billing_reserve_usage('unknown_feature') $$, '22023', null, 'unknown features are rejected');
reset role;

-- B cannot touch A's usage.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is_empty($$ select id from public.usage_ledger $$, 'user B cannot read user A''s usage');
select throws_ok($$ select public.billing_commit_usage((select id from public.usage_ledger limit 1)) $$, 'P0001', null,
  'user B cannot commit user A''s reservations');
reset role;

-- Webhooks (called without a session, as the provider would) ---------------------------
set local role anon;
select results_eq($$ select public.billing_process_webhook('mock', 'evt_bad', (select body from ev where name = 'activated'), repeat('0', 64)) ->> 'result' $$,
  $$ values ('invalid_signature'::text) $$, 'a wrong signature is rejected');
select results_eq($$ select public.billing_process_webhook('razorpay', 'evt_1', (select body from ev where name = 'activated'), (select sig from ev where name = 'activated')) ->> 'result' $$,
  $$ values ('not_configured'::text) $$, 'a provider without a stored secret is not accepted');
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) ->> 'result' from ev e where e.name = 'activated' $$,
  $$ values ('processed'::text) $$, 'a signed activation is processed');
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) ->> 'result' from ev e where e.name = 'activated' $$,
  $$ values ('duplicate'::text) $$, 'a duplicate delivery is ignored');
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) ->> 'result' from ev e where e.name = 'late_pending' $$,
  $$ values ('processed'::text) $$, 'a late (older) event is accepted');
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) ->> 'result' from ev e where e.name = 'unknown_business' $$,
  $$ values ('ignored'::text) $$, 'an event for an unknown business is ignored');
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) ->> 'result' from ev e where e.name = 'other_event' $$,
  $$ values ('ignored'::text) $$, 'unused event types are ignored safely');
select throws_ok($$ select * from public.billing_webhook_events $$, '42501', null, 'the webhook log is not readable');
reset role;

select results_eq($$ select status, plan_id = (select id from public.billing_plans where slug = 'starter') from public.business_subscriptions where provider_subscription_id = 'sub_A1' $$,
  $$ values ('ACTIVE'::text, true) $$, 'the subscription is active on Starter (an older pending event did not overwrite it)');
select results_eq($$ select count(*)::int, min(status) from public.billing_payments where provider_payment_id = 'pay_1' $$,
  $$ values (1, 'CAPTURED'::text) $$, 'the payment is recorded once');

-- Owner A now has Starter limits; B cannot see A's billing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select results_eq($$ select monthly_limit from public.billing_usage_summary() where feature_key = 'ai_text_generation' $$,
  $$ values (200) $$, 'an upgrade raises this month''s allowance');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is_empty($$ select id from public.business_subscriptions union all select id from public.billing_payments $$,
  'user B cannot read user A''s subscription or payments');
select throws_ok($$ select public.billing_mark_cancel_requested((select id from public.business_subscriptions limit 1)) $$, 'P0001', null,
  'user B cannot cancel user A''s subscription');
reset role;

-- Renewal, upgrade, cancellation.
set local role anon;
select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) from ev e where e.name = 'charged';
select results_eq($$ select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) -> 'cancel' from ev e where e.name = 'upgrade' $$,
  $$ values ('["sub_A1"]'::jsonb) $$, 'activating a new plan asks to cancel the previous subscription');
select public.billing_process_webhook('mock', e.event_id, e.body, e.sig) from ev e where e.name = 'cancelled';
reset role;
select results_eq(
  $$ select provider_subscription_id, status from public.business_subscriptions order by provider_subscription_id $$,
  $$ values ('sub_A1'::text, 'CANCELLED'::text), ('sub_A2', 'ACTIVE') $$,
  'renewal extends, cancellation is recorded, the upgraded plan stays active');

select * from finish();
rollback;
