-- Dukaan Sathi — Phase 2: content workflow
-- Tables: content_templates (reference data), content_items (owner data).
-- Adds marketing preferences to businesses and a notification preference to profiles.
-- Controlled values must stay in sync with lib/config/content.ts and lib/config/marketing.ts
-- (checked by tests/unit/config-sync.test.ts).

-- ---------------------------------------------------------------------------
-- Marketing preferences (business level) and settings (profile level)
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column content_language text check (content_language in ('en', 'mr', 'hi')),
  add column tone text check (tone in ('professional', 'friendly', 'local', 'premium', 'energetic', 'traditional')),
  add column target_customers text check (char_length(target_customers) <= 300),
  add column preferred_cta text check (char_length(preferred_cta) <= 120),
  add column promotional_style text check (promotional_style in ('offers', 'quality', 'new_arrivals', 'festive', 'service')),
  add column preferred_contact_method text check (preferred_contact_method in ('whatsapp', 'phone', 'visit_store', 'website'));

comment on column public.businesses.content_language is 'Default language for marketing content. Null = use the owner''s app language.';

alter table public.profiles
  add column product_update_emails boolean not null default true;

comment on column public.profiles.product_update_emails is 'Owner opted in to occasional product update emails. Stored preference only; nothing is sent automatically in Phase 2.';

-- Needed so content_items can reference (business, owner) together.
alter table public.businesses add constraint businesses_id_owner_key unique (id, owner_id);

-- ---------------------------------------------------------------------------
-- content_templates: shared, read-only reference data
-- ---------------------------------------------------------------------------

create table public.content_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  content_type text not null check (content_type in ('POST', 'OFFER', 'POSTER', 'REEL', 'WHATSAPP', 'FESTIVAL', 'OTHER')),
  description text not null check (char_length(description) <= 300),
  -- Empty array = suitable for every business category.
  business_categories text[] not null default '{}' check (business_categories <@ array[
    'grocery', 'mobile_shop', 'clothing', 'electronics', 'hardware', 'footwear',
    'jewellery', 'medical_pharmacy', 'restaurant_food', 'bakery', 'salon',
    'automobile', 'repair_services', 'coaching_education', 'agriculture_agro_input',
    'nursery', 'dairy', 'farm_equipment', 'furniture', 'stationery', 'other'
  ]::text[]),
  languages text[] not null default '{en,mr,hi}' check (languages <@ array['en', 'mr', 'hi']::text[] and cardinality(languages) > 0),
  default_cta text check (char_length(default_cta) <= 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_templates is 'Structures for future generated content. Managed by migrations; read-only for users.';

create trigger content_templates_set_updated_at
  before update on public.content_templates
  for each row execute function public.set_updated_at();

insert into public.content_templates (slug, name, content_type, description, default_cta, sort_order) values
  ('product-showcase', 'Product Showcase', 'POST', 'Highlight one product: what it is, why it is good, and its price.', 'Visit our shop today', 10),
  ('special-offer', 'Special Offer', 'OFFER', 'Announce a discount or deal with a clear benefit for the customer.', 'Grab this offer now', 20),
  ('new-arrival', 'New Arrival', 'POST', 'Tell customers about new stock that just came in.', 'Come and see it first', 30),
  ('festival-offer', 'Festival Offer', 'FESTIVAL', 'Festival greetings combined with a special festival deal.', 'Celebrate with us', 40),
  ('customer-attraction', 'Customer Attraction', 'POSTER', 'A bold poster to bring new customers into the shop.', 'Visit us today', 50),
  ('educational', 'Educational Tip', 'POST', 'A useful tip related to your products that builds trust.', 'Ask us for advice', 60),
  ('limited-time-offer', 'Limited Time Offer', 'OFFER', 'A deal that ends soon, to encourage quick action.', 'Hurry, offer ends soon', 70);

-- ---------------------------------------------------------------------------
-- content_items: one content request / draft, owned by a user and their business
-- ---------------------------------------------------------------------------

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid references public.content_templates (id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 120),
  content_type text not null check (content_type in ('POST', 'OFFER', 'POSTER', 'REEL', 'WHATSAPP', 'FESTIVAL', 'OTHER')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
  language text not null default 'en' check (language in ('en', 'mr', 'hi')),
  product_name text check (char_length(product_name) <= 120),
  -- Free text on purpose: shop owners write prices like "₹40/kg" or "2 for ₹99".
  price text check (char_length(price) <= 50),
  description text check (char_length(description) <= 1000),
  offer_text text check (char_length(offer_text) <= 300),
  call_to_action text check (char_length(call_to_action) <= 120),
  notes text check (char_length(notes) <= 1000),
  -- Internal planning date only. Nothing is published automatically.
  scheduled_for timestamptz,
  -- Lower-cased text for simple search over title, product/service and offer.
  search_text text generated always as (
    lower(coalesce(title, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(offer_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The business must belong to the same owner.
  constraint content_items_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  -- Scheduled content needs a date.
  constraint content_items_scheduled_needs_date
    check (status <> 'SCHEDULED' or scheduled_for is not null),
  -- Ready / scheduled content needs something to promote.
  constraint content_items_ready_needs_details
    check (status in ('DRAFT', 'ARCHIVED') or coalesce(product_name, offer_text, description) is not null)
);

comment on table public.content_items is 'Marketing content requests and drafts. No AI generation or publishing in Phase 2.';
comment on column public.content_items.scheduled_for is 'Planned date/time (internal metadata). Publishing automation comes in a later phase.';

create index content_items_owner_updated_idx on public.content_items (owner_id, updated_at desc);
create index content_items_owner_status_idx on public.content_items (owner_id, status);
create index content_items_owner_scheduled_idx on public.content_items (owner_id, scheduled_for) where scheduled_for is not null;
create index content_items_business_idx on public.content_items (business_id);
create index content_items_template_idx on public.content_items (template_id);

create trigger content_items_set_updated_at
  before update on public.content_items
  for each row execute function public.set_updated_at();

-- Status lifecycle, enforced in the database so it cannot be bypassed through the API:
--   new items start as DRAFT
--   DRAFT -> READY, READY -> SCHEDULED, SCHEDULED -> DRAFT, DRAFT -> ARCHIVED, READY -> ARCHIVED
--   PUBLISHED exists for future phases; users cannot set it.
--   ARCHIVED items are read-only (they can still be deleted).
create or replace function public.content_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'New content must start as a draft' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'ARCHIVED' then
    raise exception 'Archived content cannot be changed' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('DRAFT', 'READY'), ('READY', 'SCHEDULED'), ('SCHEDULED', 'DRAFT'),
      ('DRAFT', 'ARCHIVED'), ('READY', 'ARCHIVED')
    ) then
      raise exception 'Status change % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
    -- Leaving the schedule clears the planned date.
    if old.status = 'SCHEDULED' then
      new.scheduled_for := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger content_items_guard
  before insert or update on public.content_items
  for each row execute function public.content_items_guard();

revoke execute on function public.content_items_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

revoke all on public.content_templates, public.content_items from anon, authenticated;
grant select on public.content_templates to authenticated;
grant select, insert, update, delete on public.content_items to authenticated;

alter table public.content_templates enable row level security;
alter table public.content_items enable row level security;

create policy "Signed-in users can view active templates"
  on public.content_templates for select to authenticated
  using (is_active);
-- No insert/update/delete policies: templates change only through migrations.

create policy "Owners can view their content"
  on public.content_items for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create content for their own business"
  on public.content_items for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = (select auth.uid())
    )
  );

create policy "Owners can update their content"
  on public.content_items for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = (select auth.uid())
    )
  );

create policy "Owners can delete their content"
  on public.content_items for delete to authenticated
  using ((select auth.uid()) = owner_id);
