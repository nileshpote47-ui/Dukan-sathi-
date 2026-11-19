import 'server-only'
import { LIMIT_MESSAGES, type FeatureKey } from '@/lib/config/billing'
import type { MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/validation/result'
import { log } from '@/lib/observability/log'
import { allowRequest } from '@/lib/security/rate-limit'

/*
 * Usage metering for the Phase 3/4 operations. Flow:
 *   reserve (database: plan limit + monthly ledger, serialised per business and feature)
 *   → run the operation → commit on success / release on failure (the owner is not charged).
 * The database decides limits; nothing here trusts the browser.
 */

export type Reservation = { ok: true; id: string } | { ok: false; error: MessageKey }

export async function reserveUsage(feature: FeatureKey, reference?: { type: string; id: string }): Promise<Reservation> {
  // Burst protection (Phase 8) before the monthly plan limit.
  if (!(await allowRequest(feature))) return { ok: false, error: 'errors.rateLimited' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('billing_reserve_usage', {
    p_feature: feature,
    p_reference_type: reference?.type,
    p_reference_id: reference?.id,
  })
  if (error || !data) {
    if (error?.message.includes('billing:limit_reached')) return { ok: false, error: LIMIT_MESSAGES[feature] }
    log.error('[billing] reserve failed', { feature, code: error?.code })
    return { ok: false, error: 'billing.error.usage' }
  }
  return { ok: true, id: data }
}

export async function commitUsage(id: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('billing_commit_usage', { p_usage_id: id })
  if (error) log.error('[billing] commit failed', { code: error.code })
  return !error
}

export async function releaseUsage(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('billing_release_usage', { p_usage_id: id })
  if (error) log.error('[billing] release failed', { code: error.code })
}

/**
 * Run a metered operation: reserve one unit, run, then commit if it succeeded or release if
 * it failed or threw. If the usage cannot be committed, the result is not handed out.
 */
export async function withUsage<T>(
  feature: FeatureKey,
  reference: { type: string; id: string } | undefined,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const reservation = await reserveUsage(feature, reference)
  if (!reservation.ok) return { ok: false, error: reservation.error }
  let result: ActionResult<T>
  try {
    result = await run()
  } catch (error) {
    await releaseUsage(reservation.id)
    throw error
  }
  if (!result.ok) {
    await releaseUsage(reservation.id)
    return result
  }
  if (!(await commitUsage(reservation.id))) return { ok: false, error: 'billing.error.usage' }
  return result
}
