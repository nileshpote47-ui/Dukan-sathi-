-- Premium plan: ₹999/month with every metered feature and the agreed limits.
-- Run locally with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select is((select price_paise from public.billing_plans where slug = 'premium'), 99900, 'Premium costs ₹999 a month');
select ok((select is_active and sort_order > (select sort_order from public.billing_plans where slug = 'growth') from public.billing_plans where slug = 'premium'), 'Premium is active and listed after Growth');
select results_eq(
  $$ select e.feature_key, e.monthly_limit from public.plan_entitlements e join public.billing_plans p on p.id = e.plan_id where p.slug = 'premium' order by e.feature_key $$,
  $$ values ('ai_text_generation'::text, 1500), ('direct_poster'::text, 120), ('image_generation'::text, 80), ('media_export'::text, 1000), ('reel_generation'::text, 200), ('social_publishing'::text, 600) $$,
  'Premium limits: 1500 AI texts, 120 AI posters, 80 AI pictures, 1000 saved posters, 200 reels, 600 posts'
);
select ok(
  (select bool_and(pr.monthly_limit >= gr.monthly_limit)
   from public.plan_entitlements pr join public.billing_plans pp on pp.id = pr.plan_id and pp.slug = 'premium'
   join public.plan_entitlements gr on gr.feature_key = pr.feature_key
   join public.billing_plans gp on gp.id = gr.plan_id and gp.slug = 'growth'),
  'Premium gives at least as much as Growth for every feature'
);

select * from finish();
rollback;
