-- Row level security tests for profiles and businesses.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures: two users (A and B), each with a business. Created as the
-- database owner, the same way Supabase Auth inserts users.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local', 'authenticated', 'authenticated', '{"full_name": "User A"}'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local', 'authenticated', 'authenticated', '{"full_name": "User B"}');

insert into public.businesses (id, owner_id, business_name, business_category)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop');

-- Signup trigger created one profile per user, with the display name.
select results_eq(
  $$ select full_name from public.profiles where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') order by full_name $$,
  $$ values ('User A'::text), ('User B'::text) $$,
  'signup trigger creates a profile for each new user'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null,
  '1. anonymous user cannot read profiles'
);

select throws_ok(
  $$ select * from public.businesses $$,
  '42501', null,
  'anonymous user cannot read businesses'
);

select throws_ok(
  $$ insert into public.businesses (owner_id, business_name, business_category)
     values ('11111111-1111-1111-1111-111111111111', 'Fake', 'other') $$,
  '42501', null,
  '2. anonymous user cannot create business data'
);

select throws_ok(
  $$ select public.handle_new_user() $$,
  '42501', null,
  'anonymous user cannot call the signup trigger function'
);

reset role;

-- ---------------------------------------------------------------------------
-- Signed in as user A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq(
  $$ select business_name from public.businesses $$,
  $$ values ('A Kirana'::text) $$,
  '3. user can read their own business and only that'
);

select results_eq(
  $$ select count(*)::int from public.profiles $$,
  $$ values (1) $$,
  'user sees exactly one profile'
);

select results_eq(
  $$ select full_name from public.profiles $$,
  $$ values ('User A'::text) $$,
  'the visible profile is their own'
);

select results_eq(
  $$ update public.businesses set business_name = 'A Kirana Stores'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning business_name $$,
  $$ values ('A Kirana Stores'::text) $$,
  '4. user can update their own business'
);

select results_eq(
  $$ update public.profiles set preferred_language = 'mr' returning preferred_language $$,
  $$ values ('mr'::text) $$,
  'user can update their own profile'
);

select is_empty(
  $$ select id from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '5. user cannot read another user''s business by id'
);

select is_empty(
  $$ select id from public.profiles where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'user cannot read another user''s profile'
);

select is_empty(
  $$ update public.businesses set business_name = 'Hacked'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id $$,
  '6. user cannot update another user''s business'
);

select is_empty(
  $$ update public.profiles set full_name = 'Hacked'
     where user_id = '22222222-2222-2222-2222-222222222222' returning id $$,
  'user cannot update another user''s profile'
);

select is_empty(
  $$ delete from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id $$,
  '7. user cannot delete another user''s business'
);

select throws_ok(
  $$ update public.businesses set owner_id = '22222222-2222-2222-2222-222222222222'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  '8. user cannot hand their business over to another user'
);

select throws_ok(
  $$ update public.profiles set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'user cannot move their profile to another user'
);

select throws_ok(
  $$ insert into public.businesses (owner_id, business_name, business_category)
     values ('22222222-2222-2222-2222-222222222222', 'Planted', 'other') $$,
  '42501', null,
  'user cannot create a business owned by someone else'
);

select throws_ok(
  $$ insert into public.businesses (business_name, business_category) values ('Second shop', 'other') $$,
  '23505', null,
  'one business per owner in Phase 1 (owner_id defaults to the signed-in user)'
);

select throws_ok(
  $$ update public.businesses set business_category = 'casino' $$,
  '23514', null,
  'unknown business categories are rejected by the database'
);

select throws_ok(
  $$ update public.businesses set pincode = '012345' $$,
  '23514', null,
  'invalid pincodes are rejected by the database'
);

select throws_ok(
  $$ delete from public.profiles $$,
  '42501', null,
  'users cannot delete profiles directly'
);

select results_eq(
  $$ delete from public.businesses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning business_name $$,
  $$ values ('A Kirana Stores'::text) $$,
  'user can delete their own business'
);

reset role;

-- ---------------------------------------------------------------------------
-- Check as the database owner that user B's data was never touched.
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select business_name, owner_id::text from public.businesses where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  $$ values ('B Mobiles'::text, '22222222-2222-2222-2222-222222222222'::text) $$,
  'user B''s business is unchanged after user A''s attempts'
);

select * from finish();
rollback;
