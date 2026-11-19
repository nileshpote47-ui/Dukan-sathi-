-- Phase 8: per-user burst limits (rate_limit_hit).
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('51111111-1111-1111-1111-111111111111', 'rl-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('52222222-2222-2222-2222-222222222222', 'rl-b@test.local', 'authenticated', 'authenticated', '{}');

-- Structure and lockdown.
select ok((select relrowsecurity from pg_class where oid = 'public.rate_limit_counters'::regclass), 'RLS is on for rate_limit_counters');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'rate_limit_counters'), 0, 'no API policies: only the function writes counters');
select ok(not has_table_privilege('authenticated', 'public.rate_limit_counters', 'select'), 'signed-in users cannot read counters directly');
select ok(not has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'execute'), 'anon cannot call rate_limit_hit');
select ok(has_function_privilege('authenticated', 'public.rate_limit_hit(text, integer, integer)', 'execute'), 'signed-in users can call rate_limit_hit');

-- User A: limit 3 per hour.
set local role authenticated;
set local request.jwt.claims = '{"sub": "51111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select ok(public.rate_limit_hit('ai_text_generation', 3, 3600), 'first request allowed');
select ok(public.rate_limit_hit('ai_text_generation', 3, 3600), 'second request allowed');
select ok(public.rate_limit_hit('ai_text_generation', 3, 3600), 'third request allowed (at the limit)');
select ok(not public.rate_limit_hit('ai_text_generation', 3, 3600), 'fourth request refused');
select ok(public.rate_limit_hit('image_generation', 3, 3600), 'other actions are counted separately');
select throws_ok($$ select public.rate_limit_hit('Bad Action!', 3, 60) $$, '22023', 'rate_limit:invalid', 'invalid action names are refused');

-- User B is not affected by user A's counters.
set local request.jwt.claims = '{"sub": "52222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select ok(public.rate_limit_hit('ai_text_generation', 3, 3600), 'another user has their own counter');

-- Signed out: refused.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select public.rate_limit_hit('ai_text_generation', 3, 3600) $$, '42501', null, 'anon cannot count requests');

select * from finish();
rollback;
