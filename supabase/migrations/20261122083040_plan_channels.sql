-- Phase 9 (owner's decision): which channels each plan may use, and how many accounts it may connect.
--   Free:    Facebook or Instagram, ONE connected account in total
--   Starter: Facebook, Instagram, Google Business Profile (one account per post)
--   Growth / Premium: all channels (Facebook, Instagram, WhatsApp, YouTube, Google Business Profile)
-- Plan data, never hard-coded; checked on the server when connecting and when publishing.

alter table public.billing_plans
  add column allowed_channels text[] not null
    default array['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE']
    check (cardinality(allowed_channels) >= 1
      and allowed_channels <@ array['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE']),
  add column max_connected_accounts integer
    check (max_connected_accounts is null or max_connected_accounts between 1 and 50);

comment on column public.billing_plans.allowed_channels is 'Channels this plan may connect and publish to.';
comment on column public.billing_plans.max_connected_accounts is 'How many accounts may be connected at once (null = no limit).';

update public.billing_plans set allowed_channels = v.channels, max_connected_accounts = v.max_accounts
from (values
  ('free', array['FACEBOOK', 'INSTAGRAM'], 1),
  ('starter', array['FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS_PROFILE'], null),
  ('growth', array['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE'], null),
  ('premium', array['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE'], null)
) as v (slug, channels, max_accounts)
where billing_plans.slug = v.slug;
