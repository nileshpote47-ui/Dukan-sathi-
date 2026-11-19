import 'server-only'
import { RATE_LIMITS, type RateLimitedAction } from '@/lib/config/rate-limits'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * Counts one request for the signed-in user and says whether it may go ahead.
 * Fails open (allows) if the limiter itself cannot be reached: it is a safety layer, and the
 * monthly entitlements in the database still apply to every metered operation.
 */
export async function allowRequest(action: RateLimitedAction): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[action]
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rate_limit_hit', { p_action: action, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) {
    log.error('[rate-limit] check failed', { action, code: error.code })
    return true
  }
  if (data === false) log.warn('[rate-limit] limited', { action })
  return data !== false
}
