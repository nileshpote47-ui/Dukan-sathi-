-- Phase 2: RLS and lifecycle tests for content_items and content_templates.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures: users A and B, each with a business; B has one content item.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'content-a@test.local', 'authenticated', 'authenticated', '{"full_name": "User A"}'),
  ('22222222-2222-2222-2222-222222222222', 'content-b@test.local', 'authenticated', 'authenticated', '{"full_name": "User B"}');

insert into public.businesses (id, owner_id, business_name, business_category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop');

insert into public.content_items (id, business_id, owner_id, title, content_type, product_name) values
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Diwali phones', 'OFFER', 'Smartphones');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok($$ select * from public.content_items $$, '42501', null, 'anonymous user cannot read content');
select throws_ok($$ select * from public.content_templates $$, '42501', null, 'anonymous user cannot read templates');

reset role;

-- ---------------------------------------------------------------------------
-- Signed in as user A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Templates: readable, not writable
select results_eq($$ select count(*)::int from public.content_templates $$, $$ values (7) $$, 'signed-in user can read the 7 seeded templates');
select throws_ok($$ insert into public.content_templates (slug, name, content_type, description) values ('x-y', 'X', 'POST', 'x') $$,
  '42501', null, 'user cannot create templates');
select throws_ok($$ update public.content_templates set name = 'Hacked' $$, '42501', null, 'user cannot edit templates');
select throws_ok($$ delete from public.content_templates $$, '42501', null, 'user cannot delete templates');

-- Create / read / update / delete own content
select lives_ok(
  $$ insert into public.content_items (id, business_id, title, content_type, product_name, offer_text)
     values ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rice offer', 'OFFER', 'Basmati rice', '10% off') $$,
  'user can create content for their own business (owner defaults to them)'
);
select results_eq($$ select title, owner_id::text from public.content_items $$,
  $$ values ('Rice offer'::text, '11111111-1111-1111-1111-111111111111'::text) $$,
  'user reads only their own content');
select results_eq($$ select search_text from public.content_items $$,
  $$ values ('rice offer basmati rice 10% off'::text) $$, 'search text combines title, product and offer');
select results_eq(
  $$ update public.content_items set notes = 'Put near billing counter' where id = 'a0000000-0000-0000-0000-000000000001' returning notes $$,
  $$ values ('Put near billing counter'::text) $$, 'user can update their own content');

-- Other user's content
select is_empty($$ select id from public.content_items where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'user cannot read another user''s content by id');
select is_empty($$ update public.content_items set title = 'Hacked' where id = 'b0000000-0000-0000-0000-000000000001' returning id $$,
  'user cannot update another user''s content');
select is_empty($$ delete from public.content_items where id = 'b0000000-0000-0000-0000-000000000001' returning id $$,
  'user cannot delete another user''s content');

-- Ownership cannot be assigned to someone else
select throws_ok(
  $$ insert into public.content_items (business_id, owner_id, title, content_type)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Planted', 'POST') $$,
  '42501', null, 'user cannot create content owned by another user');
select throws_ok(
  $$ update public.content_items set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot hand their content to another user');
select throws_ok(
  $$ insert into public.content_items (business_id, title, content_type)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Wrong shop', 'POST') $$,
  '42501', null, 'user cannot create content for another user''s business');
select throws_ok(
  $$ update public.content_items set business_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot move content into another user''s business');

-- Status lifecycle (enforced by the database)
select throws_ok(
  $$ insert into public.content_items (business_id, title, content_type, status, product_name)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Skip draft', 'POST', 'READY', 'Rice') $$,
  '23514', null, 'new content must start as a draft');
select throws_ok(
  $$ update public.content_items set status = 'SCHEDULED', scheduled_for = now() + interval '1 day' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'draft cannot jump straight to scheduled');
select results_eq(
  $$ update public.content_items set status = 'READY' where id = 'a0000000-0000-0000-0000-000000000001' returning status $$,
  $$ values ('READY'::text) $$, 'draft -> ready');
select throws_ok(
  $$ update public.content_items set status = 'SCHEDULED' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'scheduling needs a date');
select results_eq(
  $$ update public.content_items set status = 'SCHEDULED', scheduled_for = '2026-12-01 10:00+05:30' where id = 'a0000000-0000-0000-0000-000000000001' returning status $$,
  $$ values ('SCHEDULED'::text) $$, 'ready -> scheduled with a date');
select throws_ok(
  $$ update public.content_items set status = 'PUBLISHED' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'users cannot mark content as published');
select results_eq(
  $$ update public.content_items set status = 'DRAFT' where id = 'a0000000-0000-0000-0000-000000000001' returning status, scheduled_for $$,
  $$ values ('DRAFT'::text, null::timestamptz) $$, 'scheduled -> draft clears the planned date');

select lives_ok(
  $$ insert into public.content_items (id, business_id, title, content_type)
     values ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Just an idea', 'POST') $$,
  'a draft can be saved with only a title');
select throws_ok(
  $$ update public.content_items set status = 'READY' where id = 'a0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'ready needs a product, offer or description');
select results_eq(
  $$ update public.content_items set status = 'ARCHIVED' where id = 'a0000000-0000-0000-0000-000000000002' returning status $$,
  $$ values ('ARCHIVED'::text) $$, 'draft -> archived');
select throws_ok(
  $$ update public.content_items set title = 'Edited' where id = 'a0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'archived content is read-only');
select results_eq(
  $$ delete from public.content_items where id = 'a0000000-0000-0000-0000-000000000002' returning title $$,
  $$ values ('Just an idea'::text) $$, 'user can delete their own (archived) content');

select throws_ok(
  $$ insert into public.content_items (business_id, title, content_type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bad', 'SPAM') $$,
  '23514', null, 'unknown content types are rejected');

reset role;

-- ---------------------------------------------------------------------------
-- As the database owner: B's content was never touched.
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select title, owner_id::text, business_id::text from public.content_items where id = 'b0000000-0000-0000-0000-000000000001' $$,
  $$ values ('B Diwali phones'::text, '22222222-2222-2222-2222-222222222222'::text, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::text) $$,
  'user B''s content is unchanged after user A''s attempts'
);

select * from finish();
rollback;
