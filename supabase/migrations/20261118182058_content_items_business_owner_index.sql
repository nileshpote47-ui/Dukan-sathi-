-- Cover the (business_id, owner_id) foreign key with a matching index.
-- (The older content_items_business_idx is now redundant; it is kept for now.)
create index if not exists content_items_business_owner_idx on public.content_items (business_id, owner_id);
