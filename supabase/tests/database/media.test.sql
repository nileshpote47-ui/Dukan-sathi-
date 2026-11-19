-- Phase 4: media_assets, reel storyboards and the private business-media bucket.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'media-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'media-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A Kirana', 'grocery'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B Mobiles', 'mobile_shop');
insert into public.content_items (id, business_id, owner_id, title, content_type) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rice reel', 'REEL'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Rice post', 'POST'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Phone reel', 'REEL');
insert into public.media_assets (id, business_id, owner_id, content_item_id, asset_type, source_type, status, storage_path, mime_type, width, height, file_size) values
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
   'POSTER', 'TEMPLATE_RENDERED', 'READY', '22222222-2222-2222-2222-222222222222/poster.png', 'image/png', 1080, 1350, 1000);
insert into storage.objects (bucket_id, name) values ('business-media', '22222222-2222-2222-2222-222222222222/poster.png');

select results_eq(
  $$ select public, file_size_limit::bigint from storage.buckets where id = 'business-media' $$,
  $$ values (false, 3500000::bigint) $$,
  'media bucket is private with a size limit'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Creating media
select lives_ok(
  $$ insert into public.media_assets (id, business_id, owner_id, content_item_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002',
             'IMAGE', 'UPLOAD', '11111111-1111-1111-1111-111111111111/photo.jpg', 'image/jpeg', 1600, 1200, 300000) $$,
  'owner can add media for their own content'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, content_item_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001',
             'POSTER', 'TEMPLATE_RENDERED', '11111111-1111-1111-1111-111111111111/x.png', 'image/png', 10, 10, 10) $$,
  '42501', null, 'cannot create media against another user''s content'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'IMAGE', 'UPLOAD', '11111111-1111-1111-1111-111111111111/y.png', 'image/png', 10, 10, 10) $$,
  '42501', null, 'cannot create media for another user''s business'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'IMAGE', 'UPLOAD', '22222222-2222-2222-2222-222222222222/z.png', 'image/png', 10, 10, 10) $$,
  '42501', null, 'cannot create media as another user'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'IMAGE', 'UPLOAD', '22222222-2222-2222-2222-222222222222/mine.png', 'image/png', 10, 10, 10) $$,
  '23514', null, 'file path must be inside the owner''s own folder'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, status)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'IMAGE', 'AI_GENERATED', 'READY') $$,
  '23514', null, 'a READY asset must have a stored file'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, storage_path, mime_type, width, height, file_size)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'VIDEO', 'UPLOAD', '11111111-1111-1111-1111-111111111111/v.gif', 'image/gif', 10, 10, 10) $$,
  '23514', null, 'unsupported asset and file types are rejected'
);

-- Other users' media
select is_empty(
  $$ select id from public.media_assets where owner_id = '22222222-2222-2222-2222-222222222222' $$,
  'cannot read another user''s media'
);
select is_empty(
  $$ update public.media_assets set metadata = '{"x": 1}' where id = 'b1000000-0000-0000-0000-000000000001' returning id $$,
  'cannot modify another user''s media'
);
select is_empty(
  $$ delete from public.media_assets where id = 'b1000000-0000-0000-0000-000000000001' returning id $$,
  'cannot delete another user''s media'
);

-- Integrity of own media
select throws_ok(
  $$ update public.media_assets set storage_path = '11111111-1111-1111-1111-111111111111/other.jpg' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a stored file cannot be swapped'
);
select lives_ok(
  $$ insert into public.media_assets (id, business_id, owner_id, asset_type, source_type, status, provider, model)
     values ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'IMAGE', 'AI_GENERATED', 'GENERATING', 'mock', 'mock-image-1') $$,
  'owner can start one AI generation'
);
select throws_ok(
  $$ insert into public.media_assets (business_id, owner_id, asset_type, source_type, status)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'IMAGE', 'AI_GENERATED', 'GENERATING') $$,
  '23505', null, 'only one generation at a time per owner (no duplicate provider calls)'
);
select lives_ok(
  $$ update public.media_assets set status = 'FAILED' where id = 'a1000000-0000-0000-0000-000000000002' $$,
  'a generation can be marked FAILED'
);
select throws_ok(
  $$ update public.media_assets set status = 'READY', storage_path = '11111111-1111-1111-1111-111111111111/late.png', mime_type = 'image/png', width = 1, height = 1, file_size = 1
     where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a failed generation is never marked READY'
);

-- Reel storyboards
select results_eq(
  $$ update public.content_items set storyboard = '{"version": 1, "scenes": []}' where id = 'a0000000-0000-0000-0000-000000000001' returning storyboard ->> 'version' $$,
  $$ values ('1'::text) $$,
  'owner can save a storyboard on their REEL'
);
select throws_ok(
  $$ update public.content_items set storyboard = '{"version": 1}' where id = 'a0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'storyboards are only for REEL content'
);
select is_empty(
  $$ update public.content_items set storyboard = '{"version": 1}' where id = 'b0000000-0000-0000-0000-000000000001' returning id $$,
  'cannot change another user''s storyboard'
);

-- Private storage
select is_empty(
  $$ select name from storage.objects where bucket_id = 'business-media' and name like '22222222-2222-2222-2222-222222222222/%' $$,
  'cannot see another user''s files'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('business-media', '22222222-2222-2222-2222-222222222222/evil.png') $$,
  '42501', null, 'cannot upload into another user''s folder'
);

reset role;
set local role anon;
select throws_ok(
  $$ select id from public.media_assets $$,
  '42501', null, 'anonymous visitors cannot read media'
);

reset role;
select * from finish();
rollback;
