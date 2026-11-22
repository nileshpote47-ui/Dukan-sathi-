-- Phase 9 Stage 3b: reel voiceovers are a metered feature (Free 3, Starter 20, Growth 50, Premium 100),
-- stored on REEL items only, in the owner's own voiceover folder.
-- Run locally with: npx supabase test db
-- Everything happens inside one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('71111111-1111-1111-1111-111111111111', 'vo-a@test.local', 'authenticated', 'authenticated', '{}'),
  ('72222222-2222-2222-2222-222222222222', 'vo-b@test.local', 'authenticated', 'authenticated', '{}');
insert into public.businesses (id, owner_id, business_name, business_category, onboarding_completed_at) values
  ('7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '71111111-1111-1111-1111-111111111111', 'VO A Kirana', 'grocery', now()),
  ('7bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '72222222-2222-2222-2222-222222222222', 'VO B Mobiles', 'mobile_shop', now());
insert into public.content_items (id, business_id, owner_id, title, content_type) values
  ('7c000000-0000-0000-0000-000000000001', '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '71111111-1111-1111-1111-111111111111', 'Diwali reel', 'REEL'),
  ('7c000000-0000-0000-0000-000000000002', '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '71111111-1111-1111-1111-111111111111', 'Diwali post', 'POST');

select results_eq(
  $$ select p.slug, e.monthly_limit from public.plan_entitlements e join public.billing_plans p on p.id = e.plan_id
     where e.feature_key = 'voiceover' order by e.monthly_limit $$,
  $$ values ('free'::text, 3), ('starter'::text, 20), ('growth'::text, 50), ('premium'::text, 100) $$,
  'voiceover limits per plan: Free 3, Starter 20, Growth 50, Premium 100'
);
select ok((select 'audio/mpeg' = any(allowed_mime_types) from storage.buckets where id = 'business-media'), 'the private bucket accepts MP3 voiceovers');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "71111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok(
  $$ update public.content_items set voiceover = '{"path": "71111111-1111-1111-1111-111111111111/voiceovers/7c000000-0000-0000-0000-000000000001/a.mp3", "voice": "female", "language": "mr", "chars": 40, "created_at": "2026-11-22"}'
     where id = '7c000000-0000-0000-0000-000000000001' $$,
  'the owner can store a voiceover in their own folder on a reel'
);
select throws_ok(
  $$ update public.content_items set voiceover = '{"path": "72222222-2222-2222-2222-222222222222/voiceovers/x/a.mp3"}' where id = '7c000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a voiceover path outside the owner''s folder is refused'
);
select throws_ok(
  $$ update public.content_items set voiceover = '{"path": "71111111-1111-1111-1111-111111111111/voiceovers/x/a.mp3"}' where id = '7c000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'only reels can have a voiceover'
);

select isnt(public.billing_reserve_usage('voiceover', 'content_item', 'v1'), null, 'first voiceover can be reserved');
select lives_ok($$ select public.billing_release_usage(public.billing_reserve_usage('voiceover', 'content_item', 'v2')) $$, 'a failed voiceover releases its credit');
select lives_ok($$ select public.billing_commit_usage(public.billing_reserve_usage('voiceover', 'content_item', 'v3')) $$, 'a voiceover is committed');
select is((select remaining from public.billing_usage_summary() where feature_key = 'voiceover'), 1, 'two of three used, one left on Free');

-- Owner B cannot see A's reel (and so cannot read its voiceover path).
select set_config('request.jwt.claims', '{"sub": "72222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.content_items where voiceover is not null), 0, 'another owner sees no voiceovers');

select * from finish();
rollback;
