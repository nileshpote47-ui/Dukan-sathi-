-- Dukaan Sathi — Phase 4: at most one AI picture being generated per owner at a time.
-- Prevents duplicate (paid) provider calls from double clicks or parallel tabs; the app
-- marks generations older than a few minutes as FAILED before starting a new one.
create unique index media_assets_one_generation_per_owner
  on public.media_assets (owner_id)
  where status = 'GENERATING';
