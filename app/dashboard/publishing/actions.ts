'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { cancelPublication, retryPublication } from '@/lib/services/publishing'
import type { ActionResult } from '@/lib/validation/result'
import { idSchema } from '@/lib/validation/publishing'

export async function cancelJobAction(jobId: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(jobId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  const result = await cancelPublication(id.data)
  revalidatePath('/dashboard/publishing')
  return result.ok ? { ok: true, message: 'publishing.cancelled' } : result
}

/** Explicit retry of a failed post (never automatic for permanent errors). */
export async function retryJobAction(jobId: unknown): Promise<ActionResult<{ outcome: string }>> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(jobId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  const result = await retryPublication(id.data)
  revalidatePath('/dashboard/publishing')
  return result.ok ? { ok: true, data: { outcome: result.outcome }, message: 'publishing.retried' } : result
}
