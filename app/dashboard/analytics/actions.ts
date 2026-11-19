'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { refreshEngagement } from '@/lib/services/analytics'
import type { ActionResult } from '@/lib/validation/result'

/** Explicit refresh of platform engagement numbers (rate-limited, owner's own posts only). */
export async function refreshEngagementAction(): Promise<ActionResult<{ updated: number; unavailable: number }>> {
  await requireOnboardedBusiness()
  const result = await refreshEngagement()
  revalidatePath('/dashboard/analytics')
  return result.ok ? { ok: true, data: { updated: result.updated, unavailable: result.unavailable } } : result
}
