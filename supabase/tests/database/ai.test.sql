-- Phase 3: AI copy columns on content_items (generated_copy, tone, ai_* metadata).
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ai-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'ai-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop');
insert into public.content_items (id, business_id, owner_id, title, content_type, generated_copy) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rice', 'POST', null),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Phones', 'POST', '{"headline": "B copy"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq(
  $$ update public.content_items
     set generated_copy = '{"headline": "Fresh rice", "hashtags": ["#rice"]}', tone = 'local', ai_provider = 'gemini', ai_model = 'm', ai_generated_at = now()
     where id = 'a0000000-0000-0000-0000-000000000001' returning generated_copy ->> 'headline' $$,
  $$ values ('Fresh rice'::text) $$,
  'owner can save AI copy, tone and metadata on their content'
);
select throws_ok(
  $$ update public.content_items set generated_copy = '"just a string"' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'generated copy must be a JSON object'
);
select throws_ok(
  $$ update public.content_items set generated_copy = jsonb_build_object('primary_text', repeat('x', 13000)) where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'oversized generated copy is rejected'
);
select throws_ok(
  $$ update public.content_items set tone = 'angry' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'unknown tones are rejected'
);
select is_empty(
  $$ select generated_copy from public.content_items where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'user cannot read another user''s AI copy'
);
select is_empty(
  $$ update public.content_items set generated_copy = '{"headline": "Hacked"}' where id = 'b0000000-0000-0000-0000-000000000001' returning id $$,
  'user cannot change another user''s AI copy'
);
select lives_ok(
  $$ update public.content_items set status = 'ARCHIVED' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'archive own content'
);
select throws_ok(
  $$ update public.content_items set generated_copy = '{"headline": "Edited"}' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'archived AI copy is read-only'
);

reset role;
select * from finish();
rollback;
