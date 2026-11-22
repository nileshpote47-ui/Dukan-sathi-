-- Phase 9 Stage 3b: free stock photos (Pixabay). A chosen photo is downloaded by the server, checked by
-- content and stored as the owner's own picture with a new source type, so it is never hotlinked.

alter table public.media_assets drop constraint media_assets_source_type_check;
alter table public.media_assets add constraint media_assets_source_type_check
  check (source_type in ('UPLOAD', 'AI_GENERATED', 'TEMPLATE_RENDERED', 'STOCK'));
