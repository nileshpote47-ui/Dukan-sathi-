-- Phase 9: accounts in one post per plan (Free 1, Starter 1, Growth 2, Premium 4), readable as plan data.
-- Run locally with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

select results_eq(
  $$ select slug, max_accounts_per_post from public.billing_plans where slug in ('free', 'starter', 'growth', 'premium') order by sort_order $$,
  $$ values ('free'::text, 1), ('starter'::text, 1), ('growth'::text, 2), ('premium'::text, 4) $$,
  'accounts in one post: Free 1, Starter 1, Growth 2, Premium 4'
);
select throws_ok($$ update public.billing_plans set max_accounts_per_post = 0 where slug = 'free' $$, '23514', null, 'at least one account per post');

set local role anon;
select is((select max_accounts_per_post from public.billing_plans where slug = 'premium'), 4, 'the limit is public plan data (pricing page)');

select * from finish();
rollback;
