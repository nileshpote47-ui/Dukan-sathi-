-- Phase 9 Stage 3b: reel voiceover (the owner's own voiceover lines read aloud by an Indian-language
-- text-to-speech model). A new metered feature, one voiceover per REEL item, MP3 in the private bucket.
-- Limits per plan: Free 3, Starter 20, Growth 50, Premium 100 per month.

alter table public.plan_entitlements drop constraint plan_entitlements_feature_key_check;
alter table public.plan_entitlements add constraint plan_entitlements_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster', 'voiceover'));
alter table public.usage_ledger drop constraint usage_ledger_feature_key_check;
alter table public.usage_ledger add constraint usage_ledger_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster', 'voiceover'));

insert into public.plan_entitlements (plan_id, feature_key, monthly_limit)
select p.id, v.feature_key, v.monthly_limit
from (values ('free', 'voiceover', 3), ('starter', 'voiceover', 20), ('growth', 'voiceover', 50), ('premium', 'voiceover', 100))
  as v (slug, feature_key, monthly_limit)
join public.billing_plans p on p.slug = v.slug
on conflict do nothing;

-- Same body as before, with the new feature allowed.
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
  if p_feature not in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing', 'direct_poster', 'voiceover') then
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

-- The current voiceover of a REEL item: file in the owner's folder plus how it was made. Written by the
-- server after a successful generation; the file itself is only ever shown through a signed URL.
alter table public.content_items
  add column voiceover jsonb
    check (jsonb_typeof(voiceover) = 'object' and pg_column_size(voiceover) <= 2000);
alter table public.content_items
  add constraint content_items_voiceover_reel_only check (voiceover is null or content_type = 'REEL');
alter table public.content_items
  add constraint content_items_voiceover_own_folder
    check (voiceover is null or (voiceover ->> 'path') like owner_id::text || '/voiceovers/%');
comment on column public.content_items.voiceover is 'Reel voiceover: {path, speaker, language, chars, created_at}; MP3 in the private business-media bucket.';

-- Allow MP3 voiceovers in the private bucket (same size limit).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg']
where id = 'business-media';
