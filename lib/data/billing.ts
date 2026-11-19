import 'server-only'
import { cache } from 'react'
import { requireUser } from '@/lib/auth/dal'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/config/billing'
import { displayState, entitlingSubscription } from '@/lib/billing/state'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { log } from '@/lib/observability/log'

/*
 * Billing reads. Plans are public reference data; subscriptions, payments and usage are read
 * as the signed-in owner (RLS: owner only). Nothing here writes.
 */

export type Plan = Tables<'billing_plans'> & { entitlements: Record<FeatureKey, number> }
export type Subscription = Tables<'business_subscriptions'>
export type Payment = Tables<'billing_payments'>
export interface UsageRow {
  feature_key: FeatureKey
  monthly_limit: number
  used: number
  reserved: number
  remaining: number
  period_start: string
}

function fail(what: string, error: { code?: string; message: string }): never {
  log.error(`[db] ${what}`, error.code, error.message)
  throw new Error(`Could not load ${what}`)
}

/** Active plans with their monthly limits, in display order (works signed in or out). */
export const getPlans = cache(async (): Promise<Plan[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*, plan_entitlements(feature_key, monthly_limit)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) fail('plans', error)
  return (data ?? []).map(({ plan_entitlements, ...plan }) => ({
    ...plan,
    entitlements: Object.fromEntries(
      FEATURE_KEYS.map((key) => [key, plan_entitlements.find((e) => e.feature_key === key)?.monthly_limit ?? 0]),
    ) as Record<FeatureKey, number>,
  }))
})

export interface BillingOverview {
  plans: Plan[]
  currentPlan: Plan
  current: Subscription | null
  latest: Subscription | null
  state: ReturnType<typeof displayState>
  usage: UsageRow[]
  payments: Payment[]
}

export async function getBillingOverview(): Promise<BillingOverview> {
  const user = await requireUser()
  const supabase = await createClient()
  const [plans, subs, payments, usage] = await Promise.all([
    getPlans(),
    supabase.from('business_subscriptions').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('billing_payments').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(24),
    supabase.rpc('billing_usage_summary'),
  ])
  if (subs.error) fail('subscriptions', subs.error)
  if (payments.error) fail('payments', payments.error)
  if (usage.error) fail('usage', usage.error)

  const current = entitlingSubscription(subs.data ?? [])
  const latest = subs.data?.[0] ?? null
  const free = plans.find((p) => p.slug === 'free') ?? plans[0]
  const currentPlan = (current && plans.find((p) => p.id === current.plan_id)) || free
  return {
    plans,
    currentPlan,
    current,
    latest,
    state: displayState(current, latest),
    usage: (usage.data ?? []) as UsageRow[],
    payments: payments.data ?? [],
  }
}
