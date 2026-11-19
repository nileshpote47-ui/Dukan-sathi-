-- Dukaan Sathi — Phase 4: media engine
-- * media_assets: generated, rendered and uploaded media owned by a user and their business
-- * content_items.storyboard: the reel storyboard (scenes) of a REEL content item
-- * storage bucket business-media (private) with owner-folder policies
-- Controlled values must stay in sync with lib/config/media.ts (tests/unit/config-sync.test.ts).

-- ---------------------------------------------------------------------------
-- media_assets
-- ---------------------------------------------------------------------------

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Optional link to the content the media was made for. Deleting the content keeps the media.
  content_item_id uuid references public.content_items (id) on delete set null,
  asset_type text not null check (asset_type in ('IMAGE', 'POSTER')),
  source_type text not null check (source_type in ('UPLOAD', 'AI_GENERATED', 'TEMPLATE_RENDERED')),
  status text not null default 'READY' check (status in ('GENERATING', 'READY', 'FAILED')),
  -- Object name inside the private business-media bucket: always inside the owner's folder.
  storage_path text unique check (char_length(storage_path) <= 300 and storage_path like owner_id::text || '/%'),
  mime_type text check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  width integer check (width between 1 and 4096),
  height integer check (height between 1 and 4096),
  file_size integer check (file_size between 1 and 3500000),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 100),
  -- Poster template, aspect ratio and texts, or the picture prompt summary. Never secrets.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_assets_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  -- A READY asset always has a stored, described file.
  constraint media_assets_ready_has_file
    check (status <> 'READY' or (storage_path is not null and mime_type is not null
      and width is not null and height is not null and file_size is not null))
);

comment on table public.media_assets is 'Posters, pictures (uploaded or AI-generated). Files live in the private business-media bucket.';

create index media_assets_owner_created_idx on public.media_assets (owner_id, created_at desc);
create index media_assets_content_item_idx on public.media_assets (content_item_id) where content_item_id is not null;
create index media_assets_business_idx on public.media_assets (business_id);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

-- Ownership, kind and file location are fixed once set (the stored file is never swapped).
create or replace function public.media_assets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    or new.business_id is distinct from old.business_id
    or new.asset_type is distinct from old.asset_type
    or new.source_type is distinct from old.source_type
    or (old.storage_path is not null and new.storage_path is distinct from old.storage_path) then
    raise exception 'Media ownership, type and file cannot be changed' using errcode = '23514';
  end if;
  if old.status <> 'GENERATING' and new.status is distinct from old.status then
    raise exception 'Media status % cannot change', old.status using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger media_assets_guard
  before update on public.media_assets
  for each row execute function public.media_assets_guard();

revoke execute on function public.media_assets_guard() from public, anon, authenticated;

revoke all on public.media_assets from anon, authenticated;
grant select, insert, update, delete on public.media_assets to authenticated;
alter table public.media_assets enable row level security;

create policy "Owners can view their media"
  on public.media_assets for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can add media to their own business and content"
  on public.media_assets for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = (select auth.uid())
    )
    and (
      content_item_id is null
      or exists (
        select 1 from public.content_items c
        where c.id = content_item_id and c.owner_id = (select auth.uid()) and c.business_id = media_assets.business_id
      )
    )
  );

create policy "Owners can update their media"
  on public.media_assets for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (
      content_item_id is null
      or exists (
        select 1 from public.content_items c
        where c.id = content_item_id and c.owner_id = (select auth.uid()) and c.business_id = media_assets.business_id
      )
    )
  );

create policy "Owners can delete their media"
  on public.media_assets for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Reel storyboard on REEL content items
-- ---------------------------------------------------------------------------

alter table public.content_items
  add column storyboard jsonb
    check (jsonb_typeof(storyboard) = 'object' and pg_column_size(storyboard) <= 32000);

alter table public.content_items
  add constraint content_items_storyboard_reel_only check (storyboard is null or content_type = 'REEL');

comment on column public.content_items.storyboard is 'Reel storyboard (scenes, durations, texts, picture references) validated by lib/validation/media.ts.';

-- ---------------------------------------------------------------------------
-- Storage: one private bucket; each user may only touch objects in their own folder
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', false, 3500000, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners can read their media files"
  on storage.objects for select to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners can upload media files to their folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners can delete their media files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No update policy: stored files are never overwritten (a new version is a new file).
