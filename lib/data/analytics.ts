import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import type { DateRange } from '@/lib/analytics/range'
import type { BusinessAnalytics, PlanUsageRow } from '@/lib/analytics/types'
import { createClient } from '@/lib/supabase/server'

/*
 * Owner analytics. analytics_business_overview() runs as the signed-in owner (security
 * invoker), so row level security limits every number to their own business. Nothing here
 * writes data or calls a platform.
 */

export async function getBusinessAnalytics(range: DateRange): Promise<BusinessAnalytics> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('analytics_business_overview', { p_from: range.from.toISOString(), p_to: range.to.toISOString() })
  if (error || !data) {
    console.error('[analytics] overview', error?.code)
    throw new Error('Could not load analytics')
  }
  return data as unknown as BusinessAnalytics
}

/** This month's plan usage (Phase 5 is the source of truth). */
export async function getPlanUsage(): Promise<PlanUsageRow[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('billing_usage_summary')
  if (error) {
    console.error('[analytics] plan usage', error.code)
    return []
  }
  return (data ?? []) as PlanUsageRow[]
}
