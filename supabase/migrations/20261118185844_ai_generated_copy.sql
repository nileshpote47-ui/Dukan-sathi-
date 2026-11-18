-- Dukaan Sathi — Phase 3: AI content engine
-- Generated marketing copy is stored on the existing content_items row (no second
-- content system). Only the final copy and minimal metadata are kept; prompts,
-- instructions and raw provider responses are not stored.

alter table public.content_items
  add column tone text check (tone in ('professional', 'friendly', 'local', 'premium', 'energetic', 'traditional')),
  -- Normalized AI copy, edited by the owner. Shape is validated by the app
  -- (services/ai/output.ts); the database guards type and size.
  add column generated_copy jsonb check (
    generated_copy is null
    or (jsonb_typeof(generated_copy) = 'object' and octet_length(generated_copy::text) <= 12000)
  ),
  add column ai_provider text check (char_length(ai_provider) <= 40),
  add column ai_model text check (char_length(ai_model) <= 100),
  add column ai_generated_at timestamptz;

comment on column public.content_items.tone is 'Tone used for this content (falls back to the business tone).';
comment on column public.content_items.generated_copy is 'AI-generated copy (headline, text, CTA, hashtags, reel hook/script), editable by the owner.';
comment on column public.content_items.ai_provider is 'Provider that generated generated_copy (set by the server).';
comment on column public.content_items.ai_model is 'Model that generated generated_copy (set by the server).';
comment on column public.content_items.ai_generated_at is 'When generated_copy was last generated (not when it was edited).';
