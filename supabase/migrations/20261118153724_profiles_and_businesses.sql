-- Dukaan Sathi — Phase 1 foundation
-- Tables: profiles, businesses. Both protected by row level security.
-- Category and language values must stay in sync with
-- lib/config/categories.ts and lib/config/languages.ts (checked by tests/unit/config-sync.test.ts).

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Credentials stay in auth.users.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 100),
  phone text check (phone ~ '^\+?[0-9]{10,15}$'),
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'mr', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App profile for each authenticated user. One row per auth.users row.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile automatically when a user signs up.
-- Only the display name is copied from user metadata; it is never used for authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 100), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- businesses: owned by exactly one user (owner_id).
-- Phase 1 allows one business per owner (unique index below). Dropping that
-- index is all that is needed to support multiple businesses later.
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 2 and 100),
  business_category text not null check (business_category in (
    'grocery', 'mobile_shop', 'clothing', 'electronics', 'hardware', 'footwear',
    'jewellery', 'medical_pharmacy', 'restaurant_food', 'bakery', 'salon',
    'automobile', 'repair_services', 'coaching_education', 'agriculture_agro_input',
    'nursery', 'dairy', 'farm_equipment', 'furniture', 'stationery', 'other'
  )),
  description text check (char_length(description) <= 1000),
  phone text check (phone ~ '^\+?[0-9]{10,15}$'),
  whatsapp_number text check (whatsapp_number ~ '^\+?[0-9]{10,15}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line text check (char_length(address_line) <= 200),
  village text check (char_length(village) <= 100),
  taluka text check (char_length(taluka) <= 100),
  district text check (char_length(district) <= 100),
  state text check (char_length(state) <= 100),
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  country text not null default 'India' check (char_length(country) <= 100),
  logo_url text check (char_length(logo_url) <= 500 and logo_url ~ '^https://'),
  website_url text check (char_length(website_url) <= 500 and website_url ~ '^https?://'),
  instagram_url text check (char_length(instagram_url) <= 500 and instagram_url ~ '^https?://'),
  facebook_url text check (char_length(facebook_url) <= 500 and facebook_url ~ '^https?://'),
  google_business_url text check (char_length(google_business_url) <= 500 and google_business_url ~ '^https?://'),
  brand_tagline text check (char_length(brand_tagline) <= 120),
  opening_hours text check (char_length(opening_hours) <= 200),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is 'A business owned by one user. Ownership is enforced by RLS on owner_id.';
comment on column public.businesses.onboarding_completed_at is 'Set when the owner finishes onboarding; null means onboarding can be resumed.';

create unique index businesses_one_per_owner on public.businesses (owner_id);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: anonymous visitors get nothing; signed-in users go through RLS.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.businesses from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.businesses to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- (select auth.uid()) is evaluated once per statement, which keeps policies fast.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy on profiles: a profile is removed only with its auth user (on delete cascade).

create policy "Owners can view their businesses"
  on public.businesses for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create businesses they own"
  on public.businesses for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their businesses"
  on public.businesses for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their businesses"
  on public.businesses for delete to authenticated
  using ((select auth.uid()) = owner_id);
