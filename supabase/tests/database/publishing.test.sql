-- Phase 6: social accounts, publishing jobs, scheduler, WhatsApp contacts/messages.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back (including the test Vault secret).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(52);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'pub-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'pub-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop', now());
insert into public.content_items (id, business_id, owner_id, title, content_type, description) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Diwali offer', 'OFFER', 'Sweets 10% off'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Draft post', 'POST', 'Not ready yet');
update public.content_items set status = 'READY' where id = 'c1111111-1111-1111-1111-111111111111';

-- Test server secret (rolled back). Two publishing credits on the free plan for limit tests.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'publishing_server_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'publishing_server_secret'), 'test-server-secret-0123456789abcdef0123456789');
  else
    perform vault.create_secret('test-server-secret-0123456789abcdef0123456789', 'publishing_server_secret');
  end if;
end $$;
update public.plan_entitlements set monthly_limit = 2
where feature_key = 'social_publishing' and plan_id = (select id from public.billing_plans where slug = 'free');

create temp table ids (name text primary key, id uuid);
grant select, insert, update on ids to anon, authenticated;

select ok((select bool_and(c.relrowsecurity) from pg_class c where c.oid in (
  'public.social_accounts'::regclass, 'public.social_account_credentials'::regclass, 'public.publishing_jobs'::regclass,
  'public.publishing_job_payloads'::regclass, 'public.publishing_attempts'::regclass, 'public.whatsapp_contacts'::regclass,
  'public.whatsapp_messages'::regclass, 'public.publishing_webhook_events'::regclass)), 'RLS is on for every publishing table');

-- ---------------------------------------------------------------------------
-- Owner A connects an account
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok($$ select public.publishing_connect_account('wrong-secret-wrong-secret-wrong-secret!!', 'FACEBOOK', 'mock', 'page_1', 'A Page', null, '{}', '{}', 'ciphertext-ciphertext', null) $$,
  '42501', 'publishing:forbidden', 'connecting without the server secret is refused');
insert into ids values ('fb', public.publishing_connect_account('test-server-secret-0123456789abcdef0123456789', 'FACEBOOK', 'mock', 'page_1', 'A Page', null,
  '{pages_manage_posts}', '{"provider_user_id": "meta_user_1"}', 'ciphertext-ciphertext-1', null));
select results_eq($$ select status, owner_id::text from public.social_accounts $$,
  $$ values ('CONNECTED'::text, '11111111-1111-1111-1111-111111111111'::text) $$, 'the owner sees the connected account');
select throws_ok($$ select * from public.social_account_credentials $$, '42501', null, 'owners cannot read stored tokens');
select throws_ok($$ insert into public.social_accounts (business_id, owner_id, channel, provider, external_account_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'INSTAGRAM', 'mock', 'x') $$,
  '42501', null, 'owners cannot add accounts directly');
select throws_ok($$ update public.social_accounts set status = 'CONNECTED' $$, '42501', null, 'owners cannot change account status directly');
insert into ids values ('fb2', public.publishing_connect_account('test-server-secret-0123456789abcdef0123456789', 'FACEBOOK', 'mock', 'page_1', 'A Page renamed', null,
  '{}', '{"provider_user_id": "meta_user_1"}', 'ciphertext-ciphertext-2', null));
select ok((select id from ids where name = 'fb') = (select id from ids where name = 'fb2'), 'reconnecting updates the same account');
select results_eq($$ select count(*)::int from public.publishing_get_credentials('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'fb')) $$,
  $$ values (1) $$, 'the server can read the owner''s encrypted credentials');

-- ---------------------------------------------------------------------------
-- Jobs: validation, creation, duplicates
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c2222222-2222-2222-2222-222222222222',
  (select id from ids where name = 'fb'), null, 'caption', null, null, null, '{}', '{}', false) $$,
  'P0001', 'publishing:content_not_ready', 'draft content cannot be published');
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), now() + interval '40 days', 'caption', null, null, null, '{}', '{}', false) $$,
  'P0001', 'publishing:invalid_schedule', 'schedules more than 30 days ahead are refused');
insert into ids values ('job1', public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'Sweets 10% off!', null, 'https://example.com/a.jpg', null, '{}', '{}', false));
select results_eq($$ select status, publish_mode, title from public.publishing_jobs where id = (select id from ids where name = 'job1') $$,
  $$ values ('QUEUED'::text, 'NOW'::text, 'Diwali offer'::text) $$, 'a job is queued with a snapshot of the content');
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'again', null, null, null, '{}', '{}', false) $$,
  'P0001', 'publishing:duplicate', 'a second active job for the same content and account is refused');
select throws_ok($$ update public.publishing_jobs set status = 'PUBLISHED', published_at = now() $$, '42501', null, 'owners cannot mark a job published');
select throws_ok($$ select * from public.publishing_job_payloads $$, '42501', null, 'owners cannot read job payloads');
select throws_ok($$ select public.publishing_complete_attempt('nope-nope-nope-nope-nope-nope-nope-nope', gen_random_uuid(), true, 'x', null, null, null, null, null, null, null, null) $$,
  '42501', 'publishing:forbidden', 'a browser cannot report a publication without the server secret');
select throws_ok($$ update public.content_items set status = 'PUBLISHED' where id = 'c1111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'owners cannot set content to PUBLISHED');

-- Send: exactly once.
insert into ids values ('begin1', ((public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job1'))) ->> 'attempt_id')::uuid);
select isnt((select id from ids where name = 'begin1'), null, 'the first runner starts the attempt');
select results_eq($$ select public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job1')) ->> 'result' $$,
  $$ values ('skip'::text) $$, 'a second runner or double click cannot send it again');
select results_eq($$ select reserved from public.billing_usage_summary() where feature_key = 'social_publishing' $$,
  $$ values (1) $$, 'one publishing credit is reserved while sending');
select results_eq($$ select public.publishing_complete_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'begin1'), true,
  'post_123', 'https://www.facebook.com/post_123', null, null, null, null, null, null, '{"photo": true}') $$,
  $$ values ('PUBLISHED'::text) $$, 'the provider''s success publishes the job');
select results_eq($$ select j.status, j.external_post_id, c.status from public.publishing_jobs j join public.content_items c on c.id = j.content_item_id
  where j.id = (select id from ids where name = 'job1') $$,
  $$ values ('PUBLISHED'::text, 'post_123'::text, 'PUBLISHED'::text) $$, 'external id is stored and the content becomes PUBLISHED');
select results_eq($$ select used, reserved from public.billing_usage_summary() where feature_key = 'social_publishing' $$,
  $$ values (1, 0) $$, 'a successful publication uses one credit');
select throws_ok($$ select public.publishing_complete_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'begin1'), false,
  null, null, 'PROVIDER_ERROR', 'late', null, null, null, null, null) $$, 'P0001', 'publishing:attempt_not_open', 'a finished attempt cannot be changed');
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'again', null, null, null, '{}', '{}', false) $$,
  'P0001', 'publishing:already_published', 'publishing the same content again needs confirmation');

-- Failure with a temporary error: credit released, limited automatic retry.
insert into ids values ('job2', public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'again', null, null, null, '{}', '{}', true));
insert into ids values ('begin2', ((public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job2'))) ->> 'attempt_id')::uuid);
select results_eq($$ select public.publishing_complete_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'begin2'), false,
  null, null, 'RATE_LIMITED', 'Too many calls', 600, null, null, null, null) $$,
  $$ values ('QUEUED'::text) $$, 'a rate-limited attempt is queued for a later automatic retry');
select results_eq($$ select used, reserved from public.billing_usage_summary() where feature_key = 'social_publishing' $$,
  $$ values (1, 0) $$, 'a failed attempt does not use a credit');
select results_eq($$ select public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job2')) ->> 'result' $$,
  $$ values ('skip'::text) $$, 'the retry waits for its time');
select throws_ok($$ select public.publishing_retry_job('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job2'), null) $$,
  'P0001', 'publishing:not_retryable', 'only failed jobs can be retried by hand');
select lives_ok($$ select public.publishing_cancel_job((select id from ids where name = 'job2')) $$, 'the owner can cancel a queued job');
select throws_ok($$ select public.publishing_cancel_job((select id from ids where name = 'job1')) $$, 'P0001', 'publishing:not_cancellable',
  'a published job cannot be cancelled');

-- Permanent failure: not retryable.
insert into ids values ('job3', public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'bad picture', null, null, null, '{}', '{}', true));
insert into ids values ('begin3', ((public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job3'))) ->> 'attempt_id')::uuid);
select results_eq($$ select public.publishing_complete_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'begin3'), false,
  null, null, 'INVALID_MEDIA', 'Unsupported image', 600, null, null, null, null) $$,
  $$ values ('FAILED'::text) $$, 'a media error fails without automatic retry');
select throws_ok($$ select public.publishing_retry_job('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job3'), null) $$,
  'P0001', 'publishing:not_retryable', 'media errors cannot be retried');

-- Scheduled job: not sent before its time.
insert into ids values ('job4', public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), now() + interval '1 hour', 'later', null, null, null, '{}', '{}', true));
select results_eq($$ select public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job4')) ->> 'result' $$,
  $$ values ('skip'::text) $$, 'a scheduled job is not sent before its time');
reset role;

-- ---------------------------------------------------------------------------
-- Owner B: isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is_empty($$ select id from public.social_accounts union all select id from public.publishing_jobs union all select id from public.publishing_attempts $$,
  'user B cannot see user A''s accounts, jobs or attempts');
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'steal', null, null, null, '{}', '{}', true) $$,
  'P0001', 'publishing:content_not_found', 'user B cannot publish user A''s content');
select throws_ok($$ select public.publishing_cancel_job((select id from ids where name = 'job4')) $$, 'P0001', 'publishing:not_cancellable',
  'user B cannot cancel user A''s job');
select throws_ok($$ select public.publishing_disconnect_account((select id from ids where name = 'fb')) $$, 'P0001', 'publishing:account_not_found',
  'user B cannot disconnect user A''s account');
select results_eq($$ select count(*)::int from public.publishing_get_credentials('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'fb')) $$,
  $$ values (0) $$, 'even the server, acting for user B, cannot read user A''s credentials');
select throws_ok($$ insert into public.whatsapp_contacts (business_id, owner_id, phone_e164, opt_in_source)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '+919876543210', 'in_person') $$,
  null::char(5), null::text, 'user B cannot add contacts to user A''s business');
reset role;

-- ---------------------------------------------------------------------------
-- Runner (no session) and the scheduler
-- ---------------------------------------------------------------------------
update public.publishing_jobs set scheduled_for = now() - interval '1 minute' where id = (select id from ids where name = 'job4');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select * from public.publishing_claim_due('nope-nope-nope-nope-nope-nope-nope-nope', 5) $$, '42501', 'publishing:forbidden',
  'the runner endpoint needs the server secret');
select results_eq($$ select * from public.publishing_claim_due('test-server-secret-0123456789abcdef0123456789', 5) $$,
  $$ select id from ids where name = 'job4' $$, 'due scheduled jobs are claimed by the runner');
select results_eq($$ select (public.publishing_begin_attempt('test-server-secret-0123456789abcdef0123456789', (select id from ids where name = 'job4'))) ->> 'result' $$,
  $$ values ('ok'::text) $$, 'the runner sends a due job without a user session');
reset role;
update public.publishing_jobs set started_at = now() - interval '11 minutes' where id = (select id from ids where name = 'job4');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is_empty($$ select * from public.publishing_claim_due('test-server-secret-0123456789abcdef0123456789', 5) $$, 'nothing else is due');
reset role;
select results_eq($$ select status, error_code from public.publishing_jobs where id = (select id from ids where name = 'job4') $$,
  $$ values ('FAILED'::text, 'UNKNOWN_ERROR'::text) $$, 'a job stuck in SENDING is failed as unknown (never re-sent automatically)');

-- ---------------------------------------------------------------------------
-- Entitlement, disconnect, WhatsApp webhook
-- ---------------------------------------------------------------------------
update public.plan_entitlements set monthly_limit = 1
where feature_key = 'social_publishing' and plan_id = (select id from public.billing_plans where slug = 'free');
update public.usage_ledger set amount = 1
where feature_key = 'social_publishing' and transaction_type = 'ALLOCATION' and business_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$ select public.publishing_create_job('test-server-secret-0123456789abcdef0123456789', 'c1111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'fb'), null, 'over limit', null, null, null, '{}', '{}', true) $$,
  'P0001', 'billing:limit_reached', 'publishing is refused when the monthly limit is used up');

insert into public.whatsapp_contacts (business_id, owner_id, phone_e164, name, opt_in_source)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '+919876543210', 'Ravi', 'in_person');
select lives_ok($$ select public.publishing_disconnect_account((select id from ids where name = 'fb')) $$, 'the owner disconnects the account');
select results_eq($$ select status from public.social_accounts where id = (select id from ids where name = 'fb') $$,
  $$ values ('DISCONNECTED'::text) $$, 'the account is shown as disconnected');
insert into ids values ('wa', public.publishing_connect_account('test-server-secret-0123456789abcdef0123456789', 'WHATSAPP', 'mock', 'phone_1', '+91 98765 00000', 'waba_1',
  '{}', '{}', 'ciphertext-ciphertext-3', null));
reset role;
select is_empty($$ select account_id from public.social_account_credentials where account_id = (select id from ids where name = 'fb') $$,
  'disconnecting deletes the stored tokens');

-- A WhatsApp send recorded by the server, then status webhooks (out of order, duplicated) and a STOP reply.
insert into public.publishing_jobs (id, business_id, owner_id, social_account_id, channel, status, publish_mode, title, started_at)
values ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
  (select id from ids where name = 'wa'), 'WHATSAPP', 'SENDING', 'NOW', 'Offer', now());
insert into public.publishing_attempts (id, job_id, owner_id, attempt_no)
values ('e1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 1);
select public.publishing_complete_attempt('test-server-secret-0123456789abcdef0123456789', 'e1111111-1111-1111-1111-111111111111', true, null, null, null, null, null, null, null,
  jsonb_build_array(jsonb_build_object('contact_id', (select id from public.whatsapp_contacts limit 1), 'wamid', 'wamid.1')), '{"accepted": 1}');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq($$ select public.publishing_process_whatsapp_webhook('test-server-secret-0123456789abcdef0123456789', repeat('a', 64), 'phone_1',
  '[{"wamid": "wamid.1", "status": "delivered"}]', '[]') $$, $$ values ('processed'::text) $$, 'a signed status webhook is processed');
select results_eq($$ select public.publishing_process_whatsapp_webhook('test-server-secret-0123456789abcdef0123456789', repeat('a', 64), 'phone_1',
  '[{"wamid": "wamid.1", "status": "delivered"}]', '[]') $$, $$ values ('duplicate'::text) $$, 'a duplicate delivery is ignored');
select public.publishing_process_whatsapp_webhook('test-server-secret-0123456789abcdef0123456789', repeat('b', 64), 'phone_1',
  '[{"wamid": "wamid.1", "status": "sent"}]', '["+919876543210"]');
reset role;
select results_eq($$ select m.status, c.opted_out_by from public.whatsapp_messages m join public.whatsapp_contacts c on c.id = m.contact_id $$,
  $$ values ('DELIVERED'::text, 'customer'::text) $$, 'statuses only move forward and a STOP reply opts the customer out');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$ update public.whatsapp_contacts set opted_out_at = null, opted_out_by = null $$, '23514', null,
  'the owner cannot undo a customer''s opt-out without new consent');
reset role;

select * from finish();
rollback;
