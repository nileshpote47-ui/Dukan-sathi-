-- A failed renewal (PAST_DUE: Razorpay 'pending'/'halted') pauses paid access immediately.
-- Razorpay's period dates may already describe the new, unpaid cycle, so keeping access
-- "until the period end" could give an unpaid month. Paid access = ACTIVE only (+1 day for the
-- renewal webhook to arrive). Mirrored by lib/billing/state.ts.
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
    and s.status = 'ACTIVE'
    and s.current_period_end is not null
    and now() < s.current_period_end + interval '1 day'
  order by s.current_period_start desc nulls last, s.created_at desc
  limit 1
$$;

revoke execute on function public.billing_entitling_subscription(uuid) from public, anon, authenticated;
