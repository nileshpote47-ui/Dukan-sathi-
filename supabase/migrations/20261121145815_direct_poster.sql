-- Phase 9: direct posters (one AI image that carries the owner's own text) are a new metered
-- feature. Limits per plan (decided by the owner): Free 3, Starter 30, Growth 70 per month.
-- Reservation, commit and release work exactly like the other features (Phase 5 ledger).

alter table public.plan_entitlements drop constraint plan_entitlements_feature_key_check;
alter table public.plan_entitlements add constraint plan_entitlements_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster'));
alter table public.usage_ledger drop constraint usage_ledger_feature_key_check;
alter table public.usage_ledger add constraint usage_ledger_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster'));

insert into public.plan_entitlements (plan_id, feature_key, monthly_limit)
select p.id, v.feature_key, v.monthly_limit
from (values ('free', 'direct_poster', 3), ('starter', 'direct_poster', 30), ('growth', 'direct_poster', 70))
  as v (slug, feature_key, monthly_limit)
join public.billing_plans p on p.slug = v.slug
on conflict do nothing;

-- Same body as in the publishing migration, with the new feature allowed.
create or replace function public.billing_reserve_for(p_business_id uuid, p_owner_id uuid, p_feature text, p_reference_type text, p_reference_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := public.billing_period_start();
  v_id uuid;
begin
  if p_feature not in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster') then
    raise exception 'billing:unknown_feature' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_feature, 0));
  perform public.billing_ensure_allocation(p_business_id, p_owner_id, p_feature, v_period);
  if public.billing_balance(p_business_id, p_feature, v_period) < 1 then
    raise exception 'billing:limit_reached' using errcode = 'P0001';
  end if;
  insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type, state, reference_type, reference_id, description)
  values (p_business_id, p_owner_id, p_feature, v_period, -1, 'USAGE', 'PENDING', left(p_reference_type, 40), left(p_reference_id, 100), 'Reserved')
  returning id into v_id;
  return v_id;
end;
$$;
