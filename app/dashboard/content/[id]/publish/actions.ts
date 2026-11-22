'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import type { MessageKey } from '@/lib/i18n'
import { createPublication, listTemplatesForAccount, type PublishResult } from '@/lib/services/publishing'
import { msg } from '@/lib/validation/fields'
import { idSchema, publishInputSchema } from '@/lib/validation/publishing'
import type { WhatsAppTemplate } from '@/services/publishing/types'

export type PublishActionResult =
  | { ok: true; results: PublishResult[] }
  | { ok: false; error: MessageKey; issues?: string[] }

/** Publish now or schedule. Validated again here and in the database; only an explicit, confirmed request. */
export async function publishContentAction(input: unknown): Promise<PublishActionResult> {
  await requireOnboardedBusiness()
  const parsed = publishInputSchema.safeParse(input)
  if (!parsed.success) {
    const confirmMissing = parsed.error.issues.some((i) => i.path[0] === 'confirm')
    return { ok: false, error: confirmMissing ? 'publishing.validation.confirm' : 'errors.validation' }
  }
  const result = await createPublication(parsed.data)
  revalidatePath('/dashboard/publishing')
  revalidatePath(`/dashboard/content/${parsed.data.contentId}`)
  if (!result.ok) return { ok: false, error: result.error, issues: result.issues?.map((i) => msg(i.key, i.values)) }
  return result
}

export async function loadTemplatesAction(accountId: unknown): Promise<{ ok: true; templates: WhatsAppTemplate[] } | { ok: false; error: MessageKey }> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(accountId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  return listTemplatesForAccount(id.data)
}
