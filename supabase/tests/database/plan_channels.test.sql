-- Phase 9: channels and connected accounts per plan (Free: Facebook or Instagram, 1 account; Starter: + Google
-- Business Profile; Growth/Premium: every channel). Run locally with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select results_eq(
  $$ select slug, allowed_channels, max_connected_accounts from public.billing_plans where slug in ('free', 'starter', 'growth', 'premium') order by sort_order $$,
  $$ values ('free'::text, array['FACEBOOK', 'INSTAGRAM'], 1),
            ('starter'::text, array['FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS_PROFILE'], null::int),
            ('growth'::text, array['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE'], null::int),
            ('premium'::text, array['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE'], null::int) $$,
  'channels and connected accounts per plan'
);
select throws_ok($$ update public.billing_plans set allowed_channels = array['TWITTER'] where slug = 'free' $$, '23514', null, 'only known channels');
select throws_ok($$ update public.billing_plans set allowed_channels = array[]::text[] where slug = 'free' $$, '23514', null, 'at least one channel');

set local role anon;
select is((select allowed_channels from public.billing_plans where slug = 'free'), array['FACEBOOK', 'INSTAGRAM'], 'public plan data (pricing page)');

select * from finish();
rollback;
