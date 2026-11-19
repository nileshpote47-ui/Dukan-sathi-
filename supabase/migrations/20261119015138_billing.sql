-- Dukaan Sathi — Phase 5: subscriptions, credits & billing
--
-- Tables
--   billing_plans, plan_entitlements   plans and monthly limits (data, not code; prices are placeholders)
--   business_subscriptions             a business's provider subscriptions (written only by verified webhooks)
--   billing_payments                   auditable payment history (written only by verified webhooks)
--   usage_ledger                       auditable credit ledger (allocation / usage / adjustments)
--   billing_webhook_events             provider event log for idempotency and tracing (no payloads)
--
-- Trust model: users can READ their own billing rows but never write them. All writes happen
-- inside security definer functions:
--   * billing_process_webhook()  verifies the provider's HMAC signature with a secret kept in
--     Supabase Vault (name '<provider>_webhook_secret'); without a valid signature nothing changes.
--   * billing_reserve/commit/release_usage()  meter the signed-in owner's own usage atomically.
--   * billing_mark_cancel_requested()  records the owner's own cancel-at-period-end request.
-- Controlled values must stay in sync with lib/config/billing.ts (tests/unit/config-sync.test.ts).

-- ---------------------------------------------------------------------------
-- Plans and entitlements (reference data)
-- ---------------------------------------------------------------------------

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  -- Smallest currency unit (paise). The server always reads prices from here, never from a client.
  price_paise integer not null check (price_paise >= 0),
  currency text not null default 'INR' check (currency in ('INR')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly')),
  -- false = placeholder price, not yet approved commercially (shown as such in the UI).
  is_price_final boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger billing_plans_set_updated_at
  before update on public.billing_plans
  for each row execute function public.set_updated_at();

create table public.plan_entitlements (
  plan_id uuid not null references public.billing_plans (id) on delete cascade,
  feature_key text not null check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export')),
  monthly_limit integer not null check (monthly_limit between 0 and 100000),
  primary key (plan_id, feature_key)
);

comment on table public.billing_plans is 'Subscription plans. Prices are placeholders until is_price_final. Managed by migrations only.';
comment on table public.plan_entitlements is 'Monthly limit per metered feature and plan (resets on the 1st of each month, India time).';

insert into public.billing_plans (slug, name, description, price_paise, sort_order) values
  ('free', 'Free', 'Try Dukaan Sathi with a small monthly allowance.', 0, 10),
  ('starter', 'Starter', 'For shops that post a few times every week.', 19900, 20),
  ('growth', 'Growth', 'For busy shops that market every day.', 49900, 30);

insert into public.plan_entitlements (plan_id, feature_key, monthly_limit)
select p.id, e.feature_key, e.monthly_limit
from public.billing_plans p
join (values
  ('free', 'ai_text_generation', 30), ('free', 'image_generation', 3), ('free', 'reel_generation', 5), ('free', 'media_export', 10),
  ('starter', 'ai_text_generation', 200), ('starter', 'image_generation', 20), ('starter', 'reel_generation', 30), ('starter', 'media_export', 100),
  ('growth', 'ai_text_generation', 600), ('growth', 'image_generation', 60), ('growth', 'reel_generation', 100), ('growth', 'media_export', 300)
) as e (plan_slug, feature_key, monthly_limit) on e.plan_slug = p.slug;

-- ---------------------------------------------------------------------------
-- Subscriptions, payments, usage ledger, webhook events
-- ---------------------------------------------------------------------------

create table public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.billing_plans (id),
  status text not null check (status in ('AUTHENTICATED', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'PAUSED')),
  provider text not null check (provider in ('razorpay', 'mock')),
  provider_subscription_id text not null check (char_length(provider_subscription_id) between 1 and 100),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  ended_at timestamptz,
  -- Time of the newest provider event applied (older, late events do not overwrite state).
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_subscriptions_provider_id_key unique (provider, provider_subscription_id),
  constraint business_subscriptions_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade
);

create index business_subscriptions_business_owner_idx on public.business_subscriptions (business_id, owner_id);
create index business_subscriptions_owner_idx on public.business_subscriptions (owner_id, current_period_start desc);
create index business_subscriptions_plan_idx on public.business_subscriptions (plan_id);

create trigger business_subscriptions_set_updated_at
  before update on public.business_subscriptions
  for each row execute function public.set_updated_at();

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  -- Payment history is kept even if the business is later deleted (audit).
  business_id uuid references public.businesses (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  subscription_id uuid references public.business_subscriptions (id) on delete set null,
  plan_id uuid references public.billing_plans (id),
  provider text not null check (provider in ('razorpay', 'mock')),
  provider_payment_id text not null check (char_length(provider_payment_id) between 1 and 100),
  provider_order_id text check (char_length(provider_order_id) <= 100),
  provider_invoice_id text check (char_length(provider_invoice_id) <= 100),
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null check (char_length(currency) = 3),
  status text not null check (status in ('CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED')),
  payment_type text not null default 'SUBSCRIPTION' check (payment_type in ('SUBSCRIPTION')),
  paid_at timestamptz,
  failure_reason text check (char_length(failure_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_provider_id_key unique (provider, provider_payment_id)
);

create index billing_payments_owner_idx on public.billing_payments (owner_id, created_at desc);
create index billing_payments_business_idx on public.billing_payments (business_id);
create index billing_payments_subscription_idx on public.billing_payments (subscription_id);
create index billing_payments_plan_idx on public.billing_payments (plan_id);

create trigger billing_payments_set_updated_at
  before update on public.billing_payments
  for each row execute function public.set_updated_at();

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  feature_key text not null check (feature_key in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export')),
  -- First day of the monthly period (India time).
  period_start date not null,
  -- Credits: +allocation/bonus/refund, -usage. The balance is the sum for the period.
  amount integer not null check (amount between -100000 and 100000),
  transaction_type text not null check (transaction_type in ('ALLOCATION', 'USAGE', 'BONUS', 'ADJUSTMENT', 'REFUND', 'EXPIRY')),
  -- Usage is reserved (PENDING) before a generation and COMMITTED on success or RELEASED on failure.
  state text not null default 'COMMITTED' check (state in ('PENDING', 'COMMITTED', 'RELEASED')),
  reference_type text check (char_length(reference_type) <= 40),
  reference_id text check (char_length(reference_id) <= 100),
  description text check (char_length(description) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_ledger_business_owner_fkey
    foreign key (business_id, owner_id) references public.businesses (id, owner_id) on delete cascade,
  constraint usage_ledger_usage_is_negative check (transaction_type <> 'USAGE' or amount < 0),
  constraint usage_ledger_only_usage_pending check (state = 'COMMITTED' or transaction_type = 'USAGE')
);

-- One plan allocation per business, feature and month: credits can never be allocated twice.
create unique index usage_ledger_one_allocation
  on public.usage_ledger (business_id, feature_key, period_start) where transaction_type = 'ALLOCATION';
create index usage_ledger_balance_idx on public.usage_ledger (business_id, feature_key, period_start);
create index usage_ledger_business_owner_idx on public.usage_ledger (business_id, owner_id);
create index usage_ledger_owner_idx on public.usage_ledger (owner_id, created_at desc);

create trigger usage_ledger_set_updated_at
  before update on public.usage_ledger
  for each row execute function public.set_updated_at();

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'mock')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 100),
  event_type text check (char_length(event_type) <= 100),
  status text not null check (status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 100),
  business_id uuid references public.businesses (id) on delete set null,
  error text check (char_length(error) <= 500),
  attempts integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_webhook_events_provider_event_key unique (provider, provider_event_id)
);

create index billing_webhook_events_business_idx on public.billing_webhook_events (business_id);

comment on table public.billing_webhook_events is 'Provider webhook log (ids, type, status only — no payloads or payment details). Not readable by users.';

-- ---------------------------------------------------------------------------
-- Privileges and RLS: read-only for owners; no direct writes for anyone but definer functions
-- ---------------------------------------------------------------------------

revoke all on public.billing_plans, public.plan_entitlements, public.business_subscriptions,
  public.billing_payments, public.usage_ledger, public.billing_webhook_events from anon, authenticated;
grant select on public.billing_plans, public.plan_entitlements to anon, authenticated;
grant select on public.business_subscriptions, public.billing_payments, public.usage_ledger to authenticated;

alter table public.billing_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.billing_webhook_events enable row level security;

create policy "Anyone can view active plans"
  on public.billing_plans for select to anon, authenticated
  using (is_active);

create policy "Anyone can view entitlements of active plans"
  on public.plan_entitlements for select to anon, authenticated
  using (exists (select 1 from public.billing_plans p where p.id = plan_id and p.is_active));

create policy "Owners can view their subscriptions"
  on public.business_subscriptions for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can view their payments"
  on public.billing_payments for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can view their usage"
  on public.usage_ledger for select to authenticated
  using ((select auth.uid()) = owner_id);
-- billing_webhook_events: RLS on, no policies → no access for anon/authenticated.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- First day of the current billing month in India time.
create or replace function public.billing_period_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', p_at at time zone 'Asia/Kolkata'))::date
$$;

-- The subscription that currently gives a business paid access, if any.
-- ACTIVE: until the period end + 1 day (time for the renewal event to arrive).
-- PAST_DUE (renewal failed): only until the period end. Cancelled/expired/paused: no access.
create or replace function public.billing_entitling_subscription(p_business_id uuid)
returns public.business_subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.business_subscriptions s
  where s.business_id = p_business_id
    and s.current_period_end is not null
    and (
      (s.status = 'ACTIVE' and now() < s.current_period_end + interval '1 day')
      or (s.status = 'PAST_DUE' and now() < s.current_period_end)
    )
  order by s.current_period_start desc nulls last, s.created_at desc
  limit 1
$$;

create or replace function public.billing_current_plan_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.plan_id from public.billing_entitling_subscription(p_business_id) s where s.id is not null),
    (select p.id from public.billing_plans p where p.slug = 'free')
  )
$$;

-- The signed-in owner's onboarded business (one per owner).
create or replace function public.billing_my_business()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.businesses b
  where b.owner_id = (select auth.uid()) and b.onboarding_completed_at is not null
  order by b.created_at
  limit 1
$$;

-- Make sure this month's allocation matches the current plan (allocated once; topped up after an upgrade).
create or replace function public.billing_ensure_allocation(p_business_id uuid, p_owner_id uuid, p_feature text, p_period date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid := public.billing_current_plan_id(p_business_id);
  v_limit integer;
  v_allocated integer;
begin
  select e.monthly_limit into v_limit from public.plan_entitlements e where e.plan_id = v_plan and e.feature_key = p_feature;
  v_limit := coalesce(v_limit, 0);

  insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type, reference_type, reference_id, description)
  values (p_business_id, p_owner_id, p_feature, p_period, v_limit, 'ALLOCATION', 'plan', v_plan::text, 'Monthly plan allowance')
  on conflict (business_id, feature_key, period_start) where transaction_type = 'ALLOCATION' do nothing;

  select coalesce(sum(l.amount), 0) into v_allocated
  from public.usage_ledger l
  where l.business_id = p_business_id and l.feature_key = p_feature and l.period_start = p_period
    and (l.transaction_type = 'ALLOCATION' or (l.transaction_type = 'ADJUSTMENT' and l.reference_type = 'plan_change'));

  -- Upgrade during the month: top up to the new plan's limit (never reduced on downgrade).
  if v_limit > v_allocated then
    insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type, reference_type, reference_id, description)
    values (p_business_id, p_owner_id, p_feature, p_period, v_limit - v_allocated, 'ADJUSTMENT', 'plan_change', v_plan::text, 'Plan upgraded: allowance topped up');
  end if;
end;
$$;

-- Credits available now: everything committed plus fresh reservations (a reservation older than
-- 15 minutes was never completed and no longer counts).
create or replace function public.billing_balance(p_business_id uuid, p_feature text, p_period date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.amount), 0)::integer
  from public.usage_ledger l
  where l.business_id = p_business_id and l.feature_key = p_feature and l.period_start = p_period
    and (l.state = 'COMMITTED' or (l.state = 'PENDING' and l.created_at > now() - interval '15 minutes'))
$$;

-- ---------------------------------------------------------------------------
-- Usage metering (called by the server with the owner's session)
-- ---------------------------------------------------------------------------

-- Reserve one unit before a metered operation. Serialised per business+feature, so two
-- simultaneous requests can never both take the last credit. Raises 'billing:limit_reached'.
create or replace function public.billing_reserve_usage(p_feature text, p_reference_type text default null, p_reference_id text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_business uuid := public.billing_my_business();
  v_period date := public.billing_period_start();
  v_id uuid;
begin
  if v_owner is null or v_business is null then
    raise exception 'billing:no_business' using errcode = '42501';
  end if;
  if p_feature not in ('ai_text_generation', 'image_generation', 'reel_generation', 'media_export') then
    raise exception 'billing:unknown_feature' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business::text || ':' || p_feature, 0));
  perform public.billing_ensure_allocation(v_business, v_owner, p_feature, v_period);

  if public.billing_balance(v_business, p_feature, v_period) < 1 then
    raise exception 'billing:limit_reached' using errcode = 'P0001';
  end if;

  insert into public.usage_ledger (business_id, owner_id, feature_key, period_start, amount, transaction_type, state, reference_type, reference_id, description)
  values (v_business, v_owner, p_feature, v_period, -1, 'USAGE', 'PENDING', left(p_reference_type, 40), left(p_reference_id, 100), 'Reserved')
  returning id into v_id;
  return v_id;
end;
$$;

-- Commit a reservation after the operation succeeded. Fails if it was released or is stale,
-- in which case the server must not hand out the result.
create or replace function public.billing_commit_usage(p_usage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_ledger
  set state = 'COMMITTED', description = 'Used'
  where id = p_usage_id and owner_id = (select auth.uid()) and state = 'PENDING'
    and created_at > now() - interval '15 minutes';
  if not found then
    raise exception 'billing:usage_not_pending' using errcode = 'P0001';
  end if;
end;
$$;

-- Release a reservation when the operation failed: the owner is not charged.
create or replace function public.billing_release_usage(p_usage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_ledger
  set state = 'RELEASED', description = 'Not charged (operation failed)'
  where id = p_usage_id and owner_id = (select auth.uid()) and state = 'PENDING';
end;
$$;

-- Usage for the billing page: limit, used, reserved and remaining per feature this month.
create or replace function public.billing_usage_summary()
returns table (feature_key text, monthly_limit integer, used integer, reserved integer, remaining integer, period_start date)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_business uuid := public.billing_my_business();
  v_period date := public.billing_period_start();
  v_plan uuid;
begin
  if v_business is null then
    return;
  end if;
  v_plan := public.billing_current_plan_id(v_business);
  return query
  select e.feature_key,
    greatest(e.monthly_limit, coalesce(a.allowance, 0))::integer,
    coalesce(u.used, 0)::integer,
    coalesce(u.reserved, 0)::integer,
    greatest(0, greatest(e.monthly_limit, coalesce(a.allowance, 0)) + coalesce(a.extra, 0) - coalesce(u.used, 0) - coalesce(u.reserved, 0))::integer,
    v_period
  from public.plan_entitlements e
  left join lateral (
    select
      sum(l.amount) filter (where l.transaction_type = 'ALLOCATION' or (l.transaction_type = 'ADJUSTMENT' and l.reference_type = 'plan_change')) as allowance,
      coalesce(sum(l.amount) filter (where l.transaction_type in ('BONUS', 'REFUND', 'EXPIRY') or (l.transaction_type = 'ADJUSTMENT' and l.reference_type is distinct from 'plan_change')), 0) as extra
    from public.usage_ledger l
    where l.business_id = v_business and l.feature_key = e.feature_key and l.period_start = v_period
  ) a on true
  left join lateral (
    select
      -sum(l.amount) filter (where l.transaction_type = 'USAGE' and l.state = 'COMMITTED') as used,
      -sum(l.amount) filter (where l.transaction_type = 'USAGE' and l.state = 'PENDING' and l.created_at > now() - interval '15 minutes') as reserved
    from public.usage_ledger l
    where l.business_id = v_business and l.feature_key = e.feature_key and l.period_start = v_period
  ) u on true
  where e.plan_id = v_plan
  order by e.feature_key;
end;
$$;

-- The owner asked the provider to cancel at the end of the period (called by the server only
-- after the provider confirmed). Only affects the owner's own subscription and only sets the flag;
-- the final state still comes from the provider's webhook.
create or replace function public.billing_mark_cancel_requested(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.business_subscriptions
  set cancel_at_period_end = true, cancel_requested_at = now()
  where id = p_subscription_id and owner_id = (select auth.uid()) and status in ('ACTIVE', 'PAST_DUE', 'AUTHENTICATED');
  if not found then
    raise exception 'billing:subscription_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhooks (the only way subscription and payment state changes)
-- ---------------------------------------------------------------------------

create or replace function public.billing_map_subscription_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'authenticated' then 'AUTHENTICATED'
    when 'active' then 'ACTIVE'
    when 'resumed' then 'ACTIVE'
    when 'pending' then 'PAST_DUE'
    when 'halted' then 'PAST_DUE'
    when 'cancelled' then 'CANCELLED'
    when 'completed' then 'EXPIRED'
    when 'expired' then 'EXPIRED'
    when 'paused' then 'PAUSED'
    else null
  end
$$;

create or replace function public.billing_map_payment_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'created' then 'CREATED'
    when 'authorized' then 'AUTHORIZED'
    when 'captured' then 'CAPTURED'
    when 'failed' then 'FAILED'
    when 'refunded' then 'REFUNDED'
    else 'PENDING'
  end
$$;

-- Apply one verified subscription event. Returns a summary (and subscriptions to cancel at the
-- provider after an upgrade).
create or replace function public.billing_apply_subscription_event(p_provider text, p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub jsonb := p_event #> '{payload,subscription,entity}';
  v_pay jsonb := p_event #> '{payload,payment,entity}';
  v_notes jsonb;
  v_at timestamptz := to_timestamp(coalesce((p_event ->> 'created_at')::bigint, extract(epoch from now())::bigint));
  v_status text;
  v_row public.business_subscriptions;
  v_business uuid;
  v_owner uuid;
  v_plan public.billing_plans;
  v_start timestamptz;
  v_end timestamptz;
  v_cancel text[] := '{}';
  v_pay_status text;
  v_note text;
begin
  if v_sub is null or v_sub ->> 'id' is null then
    return jsonb_build_object('result', 'ignored', 'reason', 'no subscription in payload');
  end if;
  v_notes := case when jsonb_typeof(v_sub -> 'notes') = 'object' then v_sub -> 'notes' else '{}'::jsonb end;
  v_status := public.billing_map_subscription_status(v_sub ->> 'status');
  v_start := to_timestamp(nullif(v_sub ->> 'current_start', '')::bigint);
  v_end := to_timestamp(nullif(v_sub ->> 'current_end', '')::bigint);

  select * into v_row from public.business_subscriptions
  where provider = p_provider and provider_subscription_id = v_sub ->> 'id'
  for update;

  if v_row.id is null then
    -- First event for this subscription: business and plan come from the notes our server set
    -- when creating it (signed as part of this payload).
    if v_status is null then
      return jsonb_build_object('result', 'ignored', 'reason', 'status not tracked');
    end if;
    begin
      v_business := (v_notes ->> 'business_id')::uuid;
    exception when others then
      v_business := null;
    end;
    select b.owner_id into v_owner from public.businesses b where b.id = v_business;
    select * into v_plan from public.billing_plans p where p.slug = v_notes ->> 'plan_slug' and p.slug <> 'free';
    if v_owner is null or v_plan.id is null then
      return jsonb_build_object('result', 'ignored', 'reason', 'unknown business or plan');
    end if;
    insert into public.business_subscriptions (business_id, owner_id, plan_id, status, provider, provider_subscription_id,
      current_period_start, current_period_end, cancelled_at, ended_at, last_event_at)
    values (v_business, v_owner, v_plan.id, v_status, p_provider, v_sub ->> 'id', v_start, v_end,
      case when v_status = 'CANCELLED' then v_at end,
      to_timestamp(nullif(v_sub ->> 'ended_at', '')::bigint), v_at)
    returning * into v_row;
  else
    select * into v_plan from public.billing_plans p where p.id = v_row.plan_id;
    -- Events can arrive out of order: never let an older event overwrite newer state.
    if v_status is not null and (v_row.last_event_at is null or v_at >= v_row.last_event_at) then
      update public.business_subscriptions s set
        status = v_status,
        current_period_start = coalesce(v_start, s.current_period_start),
        current_period_end = greatest(coalesce(v_end, s.current_period_end), s.current_period_end),
        cancelled_at = case when v_status = 'CANCELLED' then coalesce(s.cancelled_at, v_at) else s.cancelled_at end,
        ended_at = coalesce(to_timestamp(nullif(v_sub ->> 'ended_at', '')::bigint), s.ended_at),
        last_event_at = v_at
      where s.id = v_row.id
      returning * into v_row;
    end if;
  end if;

  -- Payment attached to the event (charge, failed renewal...): upsert by provider payment id.
  if v_pay is not null and v_pay ->> 'id' is not null then
    v_pay_status := public.billing_map_payment_status(v_pay ->> 'status');
    insert into public.billing_payments (business_id, owner_id, subscription_id, plan_id, provider, provider_payment_id,
      provider_order_id, provider_invoice_id, amount_paise, currency, status, paid_at, failure_reason)
    values (v_row.business_id, v_row.owner_id, v_row.id, v_row.plan_id, p_provider, v_pay ->> 'id',
      left(v_pay ->> 'order_id', 100), left(v_pay ->> 'invoice_id', 100),
      coalesce((v_pay ->> 'amount')::integer, 0), upper(coalesce(v_pay ->> 'currency', 'INR')), v_pay_status,
      case when v_pay_status = 'CAPTURED' then to_timestamp(coalesce((v_pay ->> 'created_at')::bigint, extract(epoch from v_at)::bigint)) end,
      left(v_pay ->> 'error_description', 300))
    on conflict (provider, provider_payment_id) do update set
      -- A captured or refunded payment is never moved back to an earlier state.
      status = case
        when public.billing_payments.status in ('CAPTURED', 'REFUNDED') and excluded.status not in ('REFUNDED') then public.billing_payments.status
        else excluded.status end,
      paid_at = coalesce(public.billing_payments.paid_at, excluded.paid_at),
      failure_reason = coalesce(excluded.failure_reason, public.billing_payments.failure_reason);
    if v_pay_status = 'CAPTURED' and coalesce((v_pay ->> 'amount')::integer, -1) <> v_plan.price_paise then
      v_note := 'amount differs from plan price';
    end if;
  end if;

  -- Upgrade: once a new subscription is active, older live subscriptions of the business are
  -- returned so the server cancels them at the provider (their own cancelled events follow).
  if v_row.status = 'ACTIVE' then
    select coalesce(array_agg(s.provider_subscription_id), '{}') into v_cancel
    from public.business_subscriptions s
    where s.business_id = v_row.business_id and s.id <> v_row.id and s.provider = p_provider
      and s.status in ('ACTIVE', 'PAST_DUE', 'AUTHENTICATED')
      and coalesce(s.current_period_start, s.created_at) <= coalesce(v_row.current_period_start, v_row.created_at);
  end if;

  return jsonb_build_object('result', 'processed', 'business_id', v_row.business_id, 'status', v_row.status,
    'cancel', to_jsonb(v_cancel), 'note', v_note);
end;
$$;

-- Entry point for provider webhooks. Callable without a session (the request comes from the
-- provider), so it trusts nothing but a valid HMAC-SHA256 signature of the raw body made with
-- the secret stored in Vault as '<provider>_webhook_secret'. Idempotent by provider event id.
create or replace function public.billing_process_webhook(p_provider text, p_event_id text, p_body text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_event jsonb;
  v_type text;
  v_log_id uuid;
  v_result jsonb;
begin
  if p_provider not in ('razorpay', 'mock') then
    return jsonb_build_object('result', 'invalid_provider');
  end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = p_provider || '_webhook_secret' limit 1;
  if v_secret is null or v_secret = '' then
    return jsonb_build_object('result', 'not_configured');
  end if;
  if p_body is null or p_signature is null
    or encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex') <> lower(p_signature) then
    return jsonb_build_object('result', 'invalid_signature');
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 100 then
    return jsonb_build_object('result', 'invalid_event');
  end if;

  begin
    v_event := p_body::jsonb;
  exception when others then
    return jsonb_build_object('result', 'invalid_event');
  end;
  v_type := left(v_event ->> 'event', 100);

  -- Idempotency: a new event is recorded once; a FAILED one may be retried by the provider.
  insert into public.billing_webhook_events (provider, provider_event_id, event_type, status, provider_subscription_id)
  values (p_provider, p_event_id, v_type, 'RECEIVED', left(v_event #>> '{payload,subscription,entity,id}', 100))
  on conflict (provider, provider_event_id) do update
    set attempts = public.billing_webhook_events.attempts + 1, status = 'RECEIVED', error = null
    where public.billing_webhook_events.status = 'FAILED'
  returning id into v_log_id;
  if v_log_id is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  begin
    if v_type like 'subscription.%' then
      v_result := public.billing_apply_subscription_event(p_provider, v_event);
    else
      v_result := jsonb_build_object('result', 'ignored', 'reason', 'event not used');
    end if;
    update public.billing_webhook_events set
      status = case when v_result ->> 'result' = 'processed' then 'PROCESSED' else 'IGNORED' end,
      business_id = nullif(v_result ->> 'business_id', '')::uuid,
      error = left(coalesce(v_result ->> 'reason', v_result ->> 'note'), 500),
      processed_at = now()
    where id = v_log_id;
    return v_result;
  exception when others then
    update public.billing_webhook_events set status = 'FAILED', error = left(sqlerrm, 500), processed_at = now() where id = v_log_id;
    return jsonb_build_object('result', 'failed');
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: only the intended entry points are callable
-- ---------------------------------------------------------------------------

revoke execute on function public.billing_period_start(timestamptz) from public, anon, authenticated;
revoke execute on function public.billing_entitling_subscription(uuid) from public, anon, authenticated;
revoke execute on function public.billing_current_plan_id(uuid) from public, anon, authenticated;
revoke execute on function public.billing_my_business() from public, anon, authenticated;
revoke execute on function public.billing_ensure_allocation(uuid, uuid, text, date) from public, anon, authenticated;
revoke execute on function public.billing_balance(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.billing_map_subscription_status(text) from public, anon, authenticated;
revoke execute on function public.billing_map_payment_status(text) from public, anon, authenticated;
revoke execute on function public.billing_apply_subscription_event(text, jsonb) from public, anon, authenticated;

revoke execute on function public.billing_reserve_usage(text, text, text) from public, anon;
revoke execute on function public.billing_commit_usage(uuid) from public, anon;
revoke execute on function public.billing_release_usage(uuid) from public, anon;
revoke execute on function public.billing_usage_summary() from public, anon;
revoke execute on function public.billing_mark_cancel_requested(uuid) from public, anon;
grant execute on function public.billing_reserve_usage(text, text, text) to authenticated;
grant execute on function public.billing_commit_usage(uuid) to authenticated;
grant execute on function public.billing_release_usage(uuid) to authenticated;
grant execute on function public.billing_usage_summary() to authenticated;
grant execute on function public.billing_mark_cancel_requested(uuid) to authenticated;

revoke execute on function public.billing_process_webhook(text, text, text, text) from public;
grant execute on function public.billing_process_webhook(text, text, text, text) to anon, authenticated;
