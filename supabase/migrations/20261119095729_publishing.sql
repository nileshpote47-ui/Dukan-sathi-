-- Phase 6: social accounts, publishing jobs, WhatsApp (opted-in contacts + template sends),
-- scheduled publishing and the social_publishing entitlement.
--
-- Trust model (same as Phase 5, no service-role key):
--   * Owners can READ their own accounts, jobs, attempts and messages (RLS).
--   * Every state change that depends on a provider result (connect, job status, published,
--     credentials) happens inside security-definer functions that require the server secret
--     stored in Vault ('publishing_server_secret'). The Next.js server holds the same value as
--     PUBLISHING_SERVER_SECRET; a browser calling these functions without it gets 42501.
--   * Provider tokens are encrypted by the server (AES-256-GCM, key only in the server env) and
--     stored in social_account_credentials, which no API role can read.
--   * Owners may cancel their own queued jobs and disconnect their own accounts directly
--     (these only remove capabilities).

-- ---------------------------------------------------------------------------
-- Billing: new metered feature (one credit per successful publication / WhatsApp send)
-- ---------------------------------------------------------------------------

alter table public.plan_entitlements drop constraint plan_entitlements_feature_key_check;
alter table public.plan_entitlements add constraint plan_entitlements_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing'));
alter table public.usage_ledger drop constraint usage_ledger_feature_key_check;
alter table public.usage_ledger add constraint usage_ledger_feature_key_check
  check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing'));

insert into public.plan_entitlements (plan_id, feature_key, monthly_limit)
select p.id, v.feature_key, v.monthly_limit
from (values ('free', 'social_publishing', 10), ('starter', 'social_publishing', 60), ('growth', 'social_publishing', 200))
  as v (slug, feature_key, monthly_limit)
join public.billing_plans p on p.slug = v.slug
on conflict do nothing;

-- Reserve one unit for a given business (shared by the owner-session entry point and the
-- publishing runner, which has no session). Serialised per business+feature.
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
  if p_feature not in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing') then
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

create or replace function public.billing_reserve_usage(p_feature text, p_reference_type text default null, p_reference_id text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_business uuid := public.billing_my_business();
begin
  if v_owner is null or v_business is null then
    raise exception 'billing:no_business' using errcode = '42501';
  end if;
  return public.billing_reserve_for(v_business, v_owner, p_feature, p_reference_type, p_reference_id);
end;
$$;

-- True when the business has at least one credit left for the feature this month (no reservation).
create or replace function public.billing_has_credit(p_business_id uuid, p_owner_id uuid, p_feature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := public.billing_period_start();
begin
  perform public.billing_ensure_allocation(p_business_id, p_owner_id, p_feature, v_period);
  return public.billing_balance(p_business_id, p_feature, v_period) >= 1;
end;
$$;

revoke execute on function public.billing_reserve_for(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.billing_has_credit(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_reserve_usage(text, text, text) from public, anon;
grant execute on function public.billing_reserve_usage(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Content lifecycle: PUBLISHED is set only by the system (publishing functions)
-- ---------------------------------------------------------------------------

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
    -- A successful publication (security-definer publishing function, never an API role).
    if new.status = 'PUBLISHED' and old.status in ('READY', 'SCHEDULED')
       and current_user not in ('anon', 'authenticated') then
      return new;
    end if;
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

revoke execute on function public.content_items_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE')),
  provider text not null check (provider in ('meta', 'google', 'mock')),
  -- Instagram account id / Page id / WhatsApp phone number id / YouTube channel id / GBP location name.
  external_account_id text not null check (char_length(external_account_id) between 1 and 200),
  external_account_name text check (char_length(external_account_name) <= 200),
  -- Facebook Page of an Instagram account, WhatsApp Business Account id, GBP account name.
  external_parent_id text check (char_length(external_parent_id) <= 200),
  status text not null default 'CONNECTED' check (status in ('CONNECTED', 'EXPIRED', 'REVOKED', 'DISCONNECTED', 'ERROR')),
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  -- Display data only (username, picture, phone display number, provider user id). Never tokens.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8000),
  last_error_code text check (char_length(last_error_code) <= 40),
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  constraint social_accounts_unique_external unique (business_id, channel, external_account_id)
);
create index social_accounts_owner_idx on public.social_accounts (owner_id, channel);
create index social_accounts_business_owner_idx on public.social_accounts (business_id, owner_id);
create index social_accounts_external_idx on public.social_accounts (provider, external_account_id);

-- Encrypted provider tokens (server-side AES-256-GCM). No API role has any privilege here.
create table public.social_account_credentials (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 20 and 20000),
  updated_at timestamptz not null default now()
);

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- History survives when the content, media or account is deleted.
  content_item_id uuid references public.content_items (id) on delete set null,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  channel text not null check (channel in ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENDING', 'PUBLISHED', 'FAILED', 'CANCELLED')),
  publish_mode text not null check (publish_mode in ('NOW', 'SCHEDULED')),
  title text not null check (char_length(title) <= 120),
  caption text not null default '' check (char_length(caption) <= 5000),
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  external_post_id text check (char_length(external_post_id) <= 200),
  external_url text check (char_length(external_url) <= 500 and external_url ~ '^https://'),
  error_code text check (error_code in ('ACCOUNT_NOT_CONNECTED', 'AUTHORIZATION_EXPIRED', 'PERMISSION_DENIED', 'INVALID_MEDIA', 'INVALID_CONTENT', 'RATE_LIMITED', 'PROVIDER_ERROR', 'SCHEDULING_ERROR', 'ENTITLEMENT_LIMIT', 'UNKNOWN_ERROR')),
  -- Short technical summary (no tokens, no raw payloads).
  error_message text check (char_length(error_message) <= 300),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  usage_id uuid,
  -- WhatsApp template name, recipient counts, poster size... Never secrets.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_jobs_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  constraint publishing_jobs_published_has_time check (status <> 'PUBLISHED' or published_at is not null)
);
create index publishing_jobs_due_idx on public.publishing_jobs (scheduled_for) where status = 'QUEUED';
create index publishing_jobs_sending_idx on public.publishing_jobs (started_at) where status = 'SENDING';
create index publishing_jobs_owner_idx on public.publishing_jobs (owner_id, created_at desc);
create index publishing_jobs_business_status_idx on public.publishing_jobs (business_id, status);
create index publishing_jobs_business_owner_idx on public.publishing_jobs (business_id, owner_id);
create index publishing_jobs_content_idx on public.publishing_jobs (content_item_id);
create index publishing_jobs_account_idx on public.publishing_jobs (social_account_id);
create index publishing_jobs_media_idx on public.publishing_jobs (media_asset_id);
-- No two active jobs for the same content on the same account (double clicks, two tabs).
create unique index publishing_jobs_one_active on public.publishing_jobs (content_item_id, social_account_id)
  where status in ('QUEUED', 'SENDING');

-- What the server sends (signed media URL, WhatsApp recipients/parameters). Server-only.
create table public.publishing_job_payloads (
  job_id uuid primary key references public.publishing_jobs (id) on delete cascade,
  media_url text check (char_length(media_url) <= 2000),
  media_path text check (char_length(media_path) <= 300),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 20000)
);

-- Every attempt is recorded (audit).
create table public.publishing_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.publishing_jobs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  attempt_no integer not null,
  outcome text not null default 'SENDING' check (outcome in ('SENDING', 'SUCCESS', 'FAILED')),
  error_code text check (char_length(error_code) <= 40),
  error_message text check (char_length(error_message) <= 300),
  -- Provider-side reference (e.g. Instagram media container id) for safe retries.
  provider_ref text check (char_length(provider_ref) <= 200),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index publishing_attempts_job_idx on public.publishing_attempts (job_id, attempt_no);
create index publishing_attempts_owner_idx on public.publishing_attempts (owner_id);

-- Customers who agreed to receive WhatsApp messages from this business (WhatsApp Business policy).
create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  name text check (char_length(trim(name)) between 1 and 80),
  opt_in_source text not null check (opt_in_source in ('in_person', 'paper', 'website', 'sms', 'phone_call', 'whatsapp_message')),
  opt_in_at timestamptz not null default now(),
  opted_out_at timestamptz,
  opted_out_by text check (opted_out_by in ('owner', 'customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_contacts_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  constraint whatsapp_contacts_unique_phone unique (business_id, phone_e164),
  constraint whatsapp_contacts_opt_out_consistent check ((opted_out_at is null) = (opted_out_by is null))
);
create index whatsapp_contacts_owner_idx on public.whatsapp_contacts (owner_id);
create index whatsapp_contacts_business_owner_idx on public.whatsapp_contacts (business_id, owner_id);
create index whatsapp_contacts_phone_idx on public.whatsapp_contacts (phone_e164);

-- One row per WhatsApp message sent by a job; status follows Meta's status webhooks.
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.publishing_jobs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts (id) on delete set null,
  wamid text unique check (char_length(wamid) <= 200),
  status text not null check (status in ('ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  error_code text check (char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index whatsapp_messages_job_idx on public.whatsapp_messages (job_id);
create index whatsapp_messages_owner_idx on public.whatsapp_messages (owner_id);
create index whatsapp_messages_contact_idx on public.whatsapp_messages (contact_id);

-- Provider webhook deliveries (idempotency + audit). Hash of the raw body; no payloads stored.
create table public.publishing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google', 'mock')),
  event_hash text not null check (char_length(event_hash) = 64),
  event_type text check (char_length(event_type) <= 60),
  status text not null default 'PROCESSED' check (status in ('PROCESSED', 'IGNORED', 'FAILED')),
  received_at timestamptz not null default now(),
  constraint publishing_webhook_events_unique unique (provider, event_hash)
);

-- updated_at
create or replace function public.publishing_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.publishing_touch() from public, anon, authenticated;
create trigger social_accounts_touch before update on public.social_accounts for each row execute function public.publishing_touch();
create trigger publishing_jobs_touch before update on public.publishing_jobs for each row execute function public.publishing_touch();
create trigger whatsapp_contacts_touch before update on public.whatsapp_contacts for each row execute function public.publishing_touch();
create trigger whatsapp_messages_touch before update on public.whatsapp_messages for each row execute function public.publishing_touch();

-- A customer's own opt-out (STOP) can only be undone by recording a new, later opt-in.
create or replace function public.whatsapp_contacts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.opted_out_by = 'customer' and new.opted_out_at is null
     and new.opt_in_at <= old.opted_out_at then
    raise exception 'The customer opted out; record their new consent first' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.phone_e164 is distinct from old.phone_e164 then
    raise exception 'The phone number cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.whatsapp_contacts_guard() from public, anon, authenticated;
create trigger whatsapp_contacts_guard before update on public.whatsapp_contacts for each row execute function public.whatsapp_contacts_guard();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.social_accounts, public.social_account_credentials, public.publishing_jobs,
  public.publishing_job_payloads, public.publishing_attempts, public.whatsapp_contacts,
  public.whatsapp_messages, public.publishing_webhook_events from anon, authenticated;

grant select on public.social_accounts, public.publishing_jobs, public.publishing_attempts, public.whatsapp_messages to authenticated;
grant select, insert, update, delete on public.whatsapp_contacts to authenticated;

alter table public.social_accounts enable row level security;
alter table public.social_account_credentials enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.publishing_job_payloads enable row level security;
alter table public.publishing_attempts enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.publishing_webhook_events enable row level security;

create policy "Owners read their social accounts" on public.social_accounts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners read their publishing jobs" on public.publishing_jobs
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners read their publishing attempts" on public.publishing_attempts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners read their WhatsApp messages" on public.whatsapp_messages
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "Owners read their WhatsApp contacts" on public.whatsapp_contacts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners add WhatsApp contacts to their business" on public.whatsapp_contacts
  for insert to authenticated with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  );
create policy "Owners update their WhatsApp contacts" on public.whatsapp_contacts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  );
create policy "Owners delete their WhatsApp contacts" on public.whatsapp_contacts
  for delete to authenticated using ((select auth.uid()) = owner_id);
-- social_account_credentials, publishing_job_payloads, publishing_webhook_events: RLS on, no policies.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------

-- The caller is the Dukaan Sathi server: it knows the secret stored in Vault.
create or replace function public.publishing_assert_server(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'publishing_server_secret';
  if v_secret is null or p_secret is null or char_length(p_secret) < 32
     or extensions.digest(p_secret, 'sha256') <> extensions.digest(v_secret, 'sha256') then
    raise exception 'publishing:forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Commit a publishing reservation (the publication happened; a slow provider must not make it free).
create or replace function public.publishing_commit_usage(p_usage_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_ledger set state = 'COMMITTED', description = 'Used'
  where id = p_usage_id and state = 'PENDING';
$$;

create or replace function public.publishing_release_usage(p_usage_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_ledger set state = 'RELEASED', description = 'Not charged (publishing failed)'
  where id = p_usage_id and state = 'PENDING';
$$;

-- Errors the owner may retry (after reconnecting, upgrading or waiting). Content/media errors need a new post.
create or replace function public.publishing_retryable(p_error_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_error_code not in ('INVALID_MEDIA', 'INVALID_CONTENT', 'SCHEDULING_ERROR'), true)
$$;

revoke execute on function public.publishing_assert_server(text) from public, anon, authenticated;
revoke execute on function public.publishing_commit_usage(uuid) from public, anon, authenticated;
revoke execute on function public.publishing_release_usage(uuid) from public, anon, authenticated;
revoke execute on function public.publishing_retryable(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

-- Connect (or reconnect) an account for the signed-in owner's business after OAuth.
create or replace function public.publishing_connect_account(
  p_secret text, p_channel text, p_provider text, p_external_id text, p_name text, p_parent_id text,
  p_scopes text[], p_metadata jsonb, p_ciphertext text, p_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_business uuid := public.billing_my_business();
  v_id uuid;
begin
  perform public.publishing_assert_server(p_secret);
  if v_owner is null or v_business is null then
    raise exception 'publishing:no_business' using errcode = '42501';
  end if;

  insert into public.social_accounts as a (business_id, owner_id, channel, provider, external_account_id, external_account_name,
    external_parent_id, status, scopes, token_expires_at, metadata, last_error_code, connected_at, last_checked_at)
  values (v_business, v_owner, p_channel, p_provider, p_external_id, left(p_name, 200), p_parent_id, 'CONNECTED',
    coalesce(p_scopes, '{}'), p_token_expires_at, coalesce(p_metadata, '{}'::jsonb), null, now(), now())
  on conflict (business_id, channel, external_account_id) do update
    set provider = excluded.provider, external_account_name = excluded.external_account_name,
        external_parent_id = excluded.external_parent_id, status = 'CONNECTED', scopes = excluded.scopes,
        token_expires_at = excluded.token_expires_at, metadata = excluded.metadata, last_error_code = null,
        connected_at = now(), last_checked_at = now()
  returning a.id into v_id;

  insert into public.social_account_credentials (account_id, ciphertext, updated_at)
  values (v_id, p_ciphertext, now())
  on conflict (account_id) do update set ciphertext = excluded.ciphertext, updated_at = now();
  return v_id;
end;
$$;

-- Encrypted credentials for one account. With a session: own accounts only. Without (runner): any.
create or replace function public.publishing_get_credentials(p_secret text, p_account_id uuid)
returns table (ciphertext text, channel text, provider text, external_account_id text, external_parent_id text, status text, token_expires_at timestamptz, metadata jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.publishing_assert_server(p_secret);
  return query
  select c.ciphertext, a.channel, a.provider, a.external_account_id, a.external_parent_id, a.status, a.token_expires_at, a.metadata
  from public.social_accounts a
  join public.social_account_credentials c on c.account_id = a.id
  where a.id = p_account_id and ((select auth.uid()) is null or a.owner_id = (select auth.uid()));
end;
$$;

-- After a token refresh.
create or replace function public.publishing_update_credentials(p_secret text, p_account_id uuid, p_ciphertext text, p_token_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publishing_assert_server(p_secret);
  update public.social_account_credentials set ciphertext = p_ciphertext, updated_at = now()
  where account_id = p_account_id
    and exists (select 1 from public.social_accounts a where a.id = p_account_id
                and ((select auth.uid()) is null or a.owner_id = (select auth.uid())));
  update public.social_accounts set token_expires_at = p_token_expires_at, last_checked_at = now()
  where id = p_account_id and ((select auth.uid()) is null or owner_id = (select auth.uid()));
end;
$$;

-- The provider said the authorization is gone or broken.
create or replace function public.publishing_mark_account(p_secret text, p_account_id uuid, p_status text, p_error_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publishing_assert_server(p_secret);
  if p_status not in ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR') then
    raise exception 'publishing:invalid_status' using errcode = '22023';
  end if;
  update public.social_accounts
  set status = p_status, last_error_code = left(p_error_code, 40), last_checked_at = now()
  where id = p_account_id and status <> 'DISCONNECTED'
    and ((select auth.uid()) is null or owner_id = (select auth.uid()));
end;
$$;

-- Owner disconnects an account: credentials are deleted, queued jobs for it are cancelled.
-- Returns nothing secret; the server revokes at the provider before calling this.
create or replace function public.publishing_disconnect_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.social_accounts set status = 'DISCONNECTED', last_error_code = null
  where id = p_account_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'publishing:account_not_found' using errcode = 'P0001';
  end if;
  delete from public.social_account_credentials where account_id = p_account_id;
  update public.publishing_jobs
  set status = 'CANCELLED', cancelled_at = now(), error_code = 'ACCOUNT_NOT_CONNECTED', error_message = 'Account disconnected'
  where social_account_id = p_account_id and status = 'QUEUED';
end;
$$;

-- The provider user removed the app (Meta deauthorize / data deletion callback).
create or replace function public.publishing_revoke_provider_user(p_secret text, p_provider text, p_provider_user_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.publishing_assert_server(p_secret);
  with revoked as (
    update public.social_accounts set status = 'REVOKED', last_error_code = 'AUTHORIZATION_EXPIRED'
    where provider = p_provider and metadata ->> 'provider_user_id' = p_provider_user_id and status <> 'DISCONNECTED'
    returning id
  ), creds as (
    delete from public.social_account_credentials where account_id in (select id from revoked)
  ), jobs as (
    update public.publishing_jobs
    set status = 'CANCELLED', cancelled_at = now(), error_code = 'AUTHORIZATION_EXPIRED', error_message = 'Access was removed on the platform'
    where social_account_id in (select id from revoked) and status = 'QUEUED'
  )
  select count(*) into v_count from revoked;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

-- Create a publishing job for the signed-in owner (validated content, account and media).
create or replace function public.publishing_create_job(
  p_secret text, p_content_id uuid, p_account_id uuid, p_scheduled_for timestamptz, p_caption text,
  p_media_asset_id uuid, p_media_url text, p_media_path text, p_payload jsonb, p_metadata jsonb, p_allow_repeat boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_business uuid := public.billing_my_business();
  v_content public.content_items%rowtype;
  v_account public.social_accounts%rowtype;
  v_when timestamptz := coalesce(p_scheduled_for, now());
  v_id uuid;
begin
  perform public.publishing_assert_server(p_secret);
  if v_owner is null or v_business is null then
    raise exception 'publishing:no_business' using errcode = '42501';
  end if;

  select * into v_content from public.content_items where id = p_content_id and owner_id = v_owner and business_id = v_business;
  if not found then
    raise exception 'publishing:content_not_found' using errcode = 'P0001';
  end if;
  if v_content.status not in ('READY', 'SCHEDULED', 'PUBLISHED') then
    raise exception 'publishing:content_not_ready' using errcode = 'P0001';
  end if;

  select * into v_account from public.social_accounts where id = p_account_id and owner_id = v_owner and business_id = v_business;
  if not found then
    raise exception 'publishing:account_not_found' using errcode = 'P0001';
  end if;
  if v_account.status <> 'CONNECTED' then
    raise exception 'publishing:account_not_connected' using errcode = 'P0001';
  end if;

  if p_media_asset_id is not null and not exists (
    select 1 from public.media_assets m where m.id = p_media_asset_id and m.owner_id = v_owner and m.status = 'READY'
  ) then
    raise exception 'publishing:media_not_found' using errcode = 'P0001';
  end if;

  if v_when < now() - interval '2 minutes' or v_when > now() + interval '30 days' then
    raise exception 'publishing:invalid_schedule' using errcode = 'P0001';
  end if;

  if not coalesce(p_allow_repeat, false) and exists (
    select 1 from public.publishing_jobs j
    where j.content_item_id = p_content_id and j.social_account_id = p_account_id and j.status = 'PUBLISHED'
  ) then
    raise exception 'publishing:already_published' using errcode = 'P0001';
  end if;

  if not public.billing_has_credit(v_business, v_owner, 'social_publishing') then
    raise exception 'billing:limit_reached' using errcode = 'P0001';
  end if;

  begin
    insert into public.publishing_jobs (business_id, owner_id, content_item_id, social_account_id, media_asset_id, channel,
      status, publish_mode, title, caption, scheduled_for, metadata)
    values (v_business, v_owner, p_content_id, p_account_id, p_media_asset_id, v_account.channel, 'QUEUED',
      case when p_scheduled_for is null then 'NOW' else 'SCHEDULED' end,
      v_content.title, coalesce(p_caption, ''), v_when, coalesce(p_metadata, '{}'::jsonb))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'publishing:duplicate' using errcode = 'P0001';
  end;

  insert into public.publishing_job_payloads (job_id, media_url, media_path, payload)
  values (v_id, p_media_url, p_media_path, coalesce(p_payload, '{}'::jsonb));
  return v_id;
end;
$$;

-- Owner cancels a job that has not started. Returns the rendition path the server may delete.
create or replace function public.publishing_cancel_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  update public.publishing_jobs set status = 'CANCELLED', cancelled_at = now()
  where id = p_job_id and owner_id = (select auth.uid()) and status = 'QUEUED';
  if not found then
    raise exception 'publishing:not_cancellable' using errcode = 'P0001';
  end if;
  select p.media_path into v_path from public.publishing_job_payloads p where p.job_id = p_job_id;
  return v_path;
end;
$$;

-- Owner retries a failed job (explicitly). A fresh media URL may be supplied.
create or replace function public.publishing_retry_job(p_secret text, p_job_id uuid, p_media_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publishing_jobs%rowtype;
begin
  perform public.publishing_assert_server(p_secret);
  select * into v_job from public.publishing_jobs where id = p_job_id and owner_id = (select auth.uid()) for update;
  if not found or v_job.status <> 'FAILED' or not public.publishing_retryable(v_job.error_code) or v_job.attempt_count >= 5 then
    raise exception 'publishing:not_retryable' using errcode = 'P0001';
  end if;
  begin
    update public.publishing_jobs
    set status = 'QUEUED', scheduled_for = now(), next_attempt_at = null, error_code = null, error_message = null
    where id = p_job_id;
  exception when unique_violation then
    raise exception 'publishing:duplicate' using errcode = 'P0001';
  end;
  if p_media_url is not null then
    update public.publishing_job_payloads set media_url = p_media_url where job_id = p_job_id;
  end if;
end;
$$;

-- Start sending: QUEUED -> SENDING exactly once (two runners or a double click cannot both send),
-- reserve one publishing credit, record the attempt and hand the server what it needs.
create or replace function public.publishing_begin_attempt(p_secret text, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publishing_jobs%rowtype;
  v_account public.social_accounts%rowtype;
  v_content_status text;
  v_payload public.publishing_job_payloads%rowtype;
  v_cipher text;
  v_attempt uuid;
  v_usage uuid;
  v_error text;
  v_message text;
begin
  perform public.publishing_assert_server(p_secret);

  update public.publishing_jobs
  set status = 'SENDING', started_at = now(), attempt_count = attempt_count + 1, last_attempt_at = now(), next_attempt_at = null
  where id = p_job_id and status = 'QUEUED' and scheduled_for <= now() + interval '1 minute'
    and coalesce(next_attempt_at, scheduled_for) <= now() + interval '1 minute'
    and ((select auth.uid()) is null or owner_id = (select auth.uid()))
  returning * into v_job;
  if not found then
    return jsonb_build_object('result', 'skip');
  end if;

  insert into public.publishing_attempts (job_id, owner_id, attempt_no)
  values (v_job.id, v_job.owner_id, v_job.attempt_count)
  returning id into v_attempt;

  select * into v_account from public.social_accounts where id = v_job.social_account_id;
  select c.status into v_content_status from public.content_items c where c.id = v_job.content_item_id;
  select c.ciphertext into v_cipher from public.social_account_credentials c where c.account_id = v_job.social_account_id;

  if v_content_status is null or v_content_status = 'ARCHIVED' then
    v_error := 'INVALID_CONTENT'; v_message := 'The content was deleted or archived';
  elsif v_account.id is null or v_account.status = 'DISCONNECTED' or v_cipher is null then
    v_error := 'ACCOUNT_NOT_CONNECTED'; v_message := 'The account is not connected';
  elsif v_account.status in ('EXPIRED', 'REVOKED') then
    v_error := 'AUTHORIZATION_EXPIRED'; v_message := 'The account needs to be reconnected';
  else
    begin
      v_usage := public.billing_reserve_for(v_job.business_id, v_job.owner_id, 'social_publishing', 'publishing_job', v_job.id::text);
    exception when others then
      if sqlerrm = 'billing:limit_reached' then
        v_error := 'ENTITLEMENT_LIMIT'; v_message := 'Monthly publishing limit reached';
      else
        raise;
      end if;
    end;
  end if;

  if v_error is not null then
    update public.publishing_jobs set status = 'FAILED', error_code = v_error, error_message = v_message where id = v_job.id;
    update public.publishing_attempts set outcome = 'FAILED', error_code = v_error, error_message = v_message, finished_at = now() where id = v_attempt;
    return jsonb_build_object('result', 'failed', 'error_code', v_error);
  end if;

  update public.publishing_jobs set usage_id = v_usage where id = v_job.id;
  select * into v_payload from public.publishing_job_payloads where job_id = v_job.id;

  return jsonb_build_object(
    'result', 'ok',
    'attempt_id', v_attempt,
    'attempt_no', v_job.attempt_count,
    'job', jsonb_build_object('id', v_job.id, 'channel', v_job.channel, 'title', v_job.title, 'caption', v_job.caption,
      'owner_id', v_job.owner_id, 'business_id', v_job.business_id, 'metadata', v_job.metadata),
    'account', jsonb_build_object('id', v_account.id, 'channel', v_account.channel, 'provider', v_account.provider,
      'external_account_id', v_account.external_account_id, 'external_parent_id', v_account.external_parent_id,
      'token_expires_at', v_account.token_expires_at, 'metadata', v_account.metadata),
    'ciphertext', v_cipher,
    'media_url', v_payload.media_url,
    'payload', coalesce(v_payload.payload, '{}'::jsonb),
    'previous_ref', (select a.provider_ref from public.publishing_attempts a
                     where a.job_id = v_job.id and a.id <> v_attempt and a.provider_ref is not null
                     order by a.attempt_no desc limit 1)
  );
end;
$$;

-- Finish an attempt with the provider's answer. Success commits the credit and marks the content
-- PUBLISHED; failure releases the credit and either queues a limited automatic retry or fails.
create or replace function public.publishing_complete_attempt(
  p_secret text, p_attempt_id uuid, p_success boolean, p_external_id text, p_external_url text,
  p_error_code text, p_error_message text, p_retry_in_seconds integer, p_account_status text,
  p_provider_ref text, p_messages jsonb, p_metadata jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.publishing_attempts%rowtype;
  v_job public.publishing_jobs%rowtype;
  v_status text;
begin
  perform public.publishing_assert_server(p_secret);
  select * into v_attempt from public.publishing_attempts where id = p_attempt_id and outcome = 'SENDING' for update;
  if not found then
    raise exception 'publishing:attempt_not_open' using errcode = 'P0001';
  end if;
  select * into v_job from public.publishing_jobs where id = v_attempt.job_id and status = 'SENDING' for update;
  if not found then
    raise exception 'publishing:attempt_not_open' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and v_job.owner_id <> (select auth.uid()) then
    raise exception 'publishing:forbidden' using errcode = '42501';
  end if;

  if p_success then
    v_status := 'PUBLISHED';
    update public.publishing_jobs
    set status = 'PUBLISHED', published_at = now(), external_post_id = left(p_external_id, 200),
        external_url = case when p_external_url ~ '^https://' then left(p_external_url, 500) end,
        error_code = null, error_message = null,
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
    where id = v_job.id;
    perform public.publishing_commit_usage(v_job.usage_id);
    update public.content_items set status = 'PUBLISHED'
    where id = v_job.content_item_id and status in ('READY', 'SCHEDULED');
    update public.publishing_attempts set outcome = 'SUCCESS', provider_ref = coalesce(left(p_provider_ref, 200), provider_ref), finished_at = now()
    where id = v_attempt.id;
  else
    perform public.publishing_release_usage(v_job.usage_id);
    if p_retry_in_seconds is not null and v_job.attempt_count < 3 and coalesce(p_error_code, '') in ('RATE_LIMITED', 'PROVIDER_ERROR') then
      v_status := 'QUEUED';
      update public.publishing_jobs
      set status = 'QUEUED', next_attempt_at = now() + make_interval(secs => greatest(60, least(p_retry_in_seconds, 3600))),
          usage_id = null, error_code = p_error_code, error_message = left(p_error_message, 300),
          metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      where id = v_job.id;
    else
      v_status := 'FAILED';
      update public.publishing_jobs
      set status = 'FAILED', usage_id = null, error_code = coalesce(p_error_code, 'UNKNOWN_ERROR'),
          error_message = left(p_error_message, 300), metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      where id = v_job.id;
    end if;
    update public.publishing_attempts
    set outcome = 'FAILED', error_code = left(coalesce(p_error_code, 'UNKNOWN_ERROR'), 40), error_message = left(p_error_message, 300),
        provider_ref = coalesce(left(p_provider_ref, 200), provider_ref), finished_at = now()
    where id = v_attempt.id;
  end if;

  if p_account_status in ('EXPIRED', 'REVOKED', 'ERROR') then
    update public.social_accounts set status = p_account_status, last_error_code = left(p_error_code, 40), last_checked_at = now()
    where id = v_job.social_account_id and status <> 'DISCONNECTED';
  end if;

  -- WhatsApp: one row per recipient message.
  if jsonb_typeof(p_messages) = 'array' then
    insert into public.whatsapp_messages (job_id, owner_id, contact_id, wamid, status, error_code)
    select v_job.id, v_job.owner_id, c.id, left(m ->> 'wamid', 200),
      case when m ->> 'wamid' is null then 'FAILED' else 'ACCEPTED' end, left(m ->> 'error_code', 40)
    from jsonb_array_elements(p_messages) m
    left join public.whatsapp_contacts c on c.id = (m ->> 'contact_id')::uuid and c.owner_id = v_job.owner_id
    on conflict (wamid) do nothing;
  end if;
  return v_status;
end;
$$;

-- Due jobs for the runner. Also fails jobs stuck in SENDING (a crashed run): the result is
-- unknown, so they are never retried automatically and the credit is released.
create or replace function public.publishing_claim_due(p_secret text, p_limit integer)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stuck record;
begin
  perform public.publishing_assert_server(p_secret);

  for v_stuck in
    select j.id, j.usage_id from public.publishing_jobs j
    where j.status = 'SENDING' and j.started_at < now() - interval '10 minutes'
    for update skip locked
  loop
    perform public.publishing_release_usage(v_stuck.usage_id);
    update public.publishing_jobs
    set status = 'FAILED', error_code = 'UNKNOWN_ERROR', usage_id = null,
        error_message = 'The result is unknown. Check the channel before retrying.'
    where id = v_stuck.id;
    update public.publishing_attempts set outcome = 'FAILED', error_code = 'UNKNOWN_ERROR', finished_at = now()
    where job_id = v_stuck.id and outcome = 'SENDING';
  end loop;

  return query
  select j.id from public.publishing_jobs j
  where j.status = 'QUEUED' and j.scheduled_for <= now() and coalesce(j.next_attempt_at, j.scheduled_for) <= now()
  order by j.scheduled_for
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhooks (Meta: WhatsApp message statuses and customer opt-outs)
-- ---------------------------------------------------------------------------

create or replace function public.publishing_process_whatsapp_webhook(
  p_secret text, p_event_hash text, p_phone_number_id text, p_statuses jsonb, p_optouts jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"ACCEPTED": 0, "SENT": 1, "DELIVERED": 2, "READ": 3}';
begin
  perform public.publishing_assert_server(p_secret);
  insert into public.publishing_webhook_events (provider, event_hash, event_type)
  values ('meta', p_event_hash, 'whatsapp')
  on conflict (provider, event_hash) do nothing;
  if not found then
    return 'duplicate';
  end if;

  -- Statuses only move forward (Meta may deliver out of order or more than once).
  if jsonb_typeof(p_statuses) = 'array' then
    update public.whatsapp_messages m
    set status = s.status, error_code = coalesce(left(s.error_code, 40), m.error_code)
    from (
      select x ->> 'wamid' as wamid, upper(x ->> 'status') as status, x ->> 'error_code' as error_code
      from jsonb_array_elements(p_statuses) x
    ) s
    where m.wamid = s.wamid
      and s.status in ('SENT', 'DELIVERED', 'READ', 'FAILED')
      and (
        (s.status = 'FAILED' and m.status in ('ACCEPTED', 'SENT'))
        or (s.status <> 'FAILED' and m.status <> 'FAILED' and (v_rank ->> s.status)::int > (v_rank ->> m.status)::int)
      );
  end if;

  -- A customer replied STOP: record their opt-out for every business on this WhatsApp number.
  if jsonb_typeof(p_optouts) = 'array' then
    update public.whatsapp_contacts c
    set opted_out_at = now(), opted_out_by = 'customer'
    where c.opted_out_at is null
      and c.phone_e164 in (select jsonb_array_elements_text(p_optouts))
      and c.business_id in (
        select a.business_id from public.social_accounts a
        where a.channel = 'WHATSAPP' and a.external_account_id = p_phone_number_id
      );
  end if;
  return 'processed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler: pg_cron calls the app's runner endpoint, but only when a job is due.
-- The endpoint URL and the shared secret live in Vault (set per environment, not in git).
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.publishing_cron_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.publishing_jobs j
    where (j.status = 'QUEUED' and j.scheduled_for <= now() and coalesce(j.next_attempt_at, j.scheduled_for) <= now())
       or (j.status = 'SENDING' and j.started_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'publishing_runner_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'publishing_server_secret';
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

select cron.schedule('publishing-runner', '* * * * *', $$select public.publishing_cron_tick()$$);

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.publishing_cron_tick() from public, anon, authenticated;

-- Secret-gated (useless without the server secret; the runner calls them without a session).
revoke execute on function public.publishing_connect_account(text, text, text, text, text, text, text[], jsonb, text, timestamptz) from public;
revoke execute on function public.publishing_get_credentials(text, uuid) from public;
revoke execute on function public.publishing_update_credentials(text, uuid, text, timestamptz) from public;
revoke execute on function public.publishing_mark_account(text, uuid, text, text) from public;
revoke execute on function public.publishing_revoke_provider_user(text, text, text) from public;
revoke execute on function public.publishing_create_job(text, uuid, uuid, timestamptz, text, uuid, text, text, jsonb, jsonb, boolean) from public;
revoke execute on function public.publishing_retry_job(text, uuid, text) from public;
revoke execute on function public.publishing_begin_attempt(text, uuid) from public;
revoke execute on function public.publishing_complete_attempt(text, uuid, boolean, text, text, text, text, integer, text, text, jsonb, jsonb) from public;
revoke execute on function public.publishing_claim_due(text, integer) from public;
revoke execute on function public.publishing_process_whatsapp_webhook(text, text, text, jsonb, jsonb) from public;

grant execute on function public.publishing_connect_account(text, text, text, text, text, text, text[], jsonb, text, timestamptz) to authenticated;
grant execute on function public.publishing_get_credentials(text, uuid) to anon, authenticated;
grant execute on function public.publishing_update_credentials(text, uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.publishing_mark_account(text, uuid, text, text) to anon, authenticated;
grant execute on function public.publishing_revoke_provider_user(text, text, text) to anon;
grant execute on function public.publishing_create_job(text, uuid, uuid, timestamptz, text, uuid, text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.publishing_retry_job(text, uuid, text) to authenticated;
grant execute on function public.publishing_begin_attempt(text, uuid) to anon, authenticated;
grant execute on function public.publishing_complete_attempt(text, uuid, boolean, text, text, text, text, integer, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.publishing_claim_due(text, integer) to anon;
grant execute on function public.publishing_process_whatsapp_webhook(text, text, text, jsonb, jsonb) to anon;

-- Owner-only (reduce capabilities).
revoke execute on function public.publishing_disconnect_account(uuid) from public, anon;
revoke execute on function public.publishing_cancel_job(uuid) from public, anon;
grant execute on function public.publishing_disconnect_account(uuid) to authenticated;
grant execute on function public.publishing_cancel_job(uuid) to authenticated;
