-- Premium plan (owner's decision: ₹999/month, limits chosen for value vs. AI cost).
-- Cheap features are generous; the two that cost real money per use (AI pictures, AI-designed
-- posters, ~₹3.5 each) are capped so even a heavy month stays well inside the price.
-- The price follows the same "final" flag as Growth (Razorpay test mode today).

insert into public.billing_plans (slug, name, description, price_paise, sort_order, is_price_final)
select 'premium', 'Premium', 'For shops that want AI posters, reels and posts every day on every channel.', 99900, 40,
       coalesce((select is_price_final from public.billing_plans where slug = 'growth'), false)
on conflict (slug) do nothing;

insert into public.plan_entitlements (plan_id, feature_key, monthly_limit)
select p.id, v.feature_key, v.monthly_limit
from (values
  ('premium', 'ai_text_generation', 1500),
  ('premium', 'image_generation', 80),
  ('premium', 'reel_generation', 200),
  ('premium', 'media_export', 1000),
  ('premium', 'social_publishing', 600),
  ('premium', 'direct_poster', 120)
) as v (slug, feature_key, monthly_limit)
join public.billing_plans p on p.slug = v.slug
on conflict do nothing;
