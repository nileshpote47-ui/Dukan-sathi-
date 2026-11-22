import 'server-only'
import { getBusiness, requireUser } from '@/lib/auth/dal'
import { allowedChannels } from '@/lib/billing/channels'
import { AUTOPILOT_CHANNELS } from '@/lib/config/autopilot'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import { createClient } from '@/lib/supabase/server'
import type { AutopilotSettingsInput } from '@/lib/validation/autopilot'
import { dbError, type ServiceResult } from './errors'

/*
 * Autopilot writes for the signed-in owner. Only Premium-type plans (autopilot_posts_per_week > 0) may turn it on;
 * accounts must be the owner's own connected Facebook / Instagram accounts, within the plan's accounts per post.
 */

export async function saveAutopilotSettings(input: AutopilotSettingsInput): Promise<ServiceResult> {
  const user = await requireUser()
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return { ok: false, error: 'errors.saveFailed' }
  const [{ currentPlan }, accounts] = await Promise.all([getBillingOverview(), listSocialAccounts()])
  if ((currentPlan.autopilot_posts_per_week ?? 0) < 1) return { ok: false, error: 'autopilot.error.plan' }

  const allowed = new Set(allowedChannels(currentPlan).filter((c) => (AUTOPILOT_CHANNELS as readonly string[]).includes(c)))
  const usable = new Set(accounts.filter((a) => a.status === 'CONNECTED' && allowed.has(a.channel as never)).map((a) => a.id))
  if (input.accountIds.some((id) => !usable.has(id))) return { ok: false, error: 'autopilot.error.accounts' }
  if (input.accountIds.length > (currentPlan.max_accounts_per_post ?? 1)) return { ok: false, error: 'publishing.error.accountLimit' }
  if (input.enabled && !input.accountIds.length) return { ok: false, error: 'autopilot.error.chooseAccount' }

  const supabase = await createClient()
  const { error } = await supabase.from('autopilot_settings').upsert(
    {
      business_id: business.id,
      owner_id: user.id,
      enabled: input.enabled,
      account_ids: input.accountIds,
      post_time: input.postTime,
      owner_offers: input.ownerOffers || null,
    },
    { onConflict: 'business_id' },
  )
  if (error) return dbError(error)
  return { ok: true }
}

/** Record the owner's decision on a prepared post (PENDING → SCHEDULED with its jobs, or SKIPPED). */
export async function decideAutopilotPost(id: string, status: 'SCHEDULED' | 'SKIPPED', jobIds: string[] = []): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('autopilot_posts')
    .update({ status, job_ids: jobIds })
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('status', 'PENDING')
    .select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'autopilot.error.decided' }
  return { ok: true }
}
