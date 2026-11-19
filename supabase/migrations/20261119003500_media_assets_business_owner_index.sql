-- Cover the (business_id, owner_id) foreign key (Supabase performance advisor), like content_items.
-- Applied on the hosted project through the SQL Editor; written to be safe to re-run.
drop index if exists public.media_assets_business_idx;
create index if not exists media_assets_business_owner_idx on public.media_assets (business_id, owner_id);
