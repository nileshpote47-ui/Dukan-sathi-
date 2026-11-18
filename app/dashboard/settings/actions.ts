'use server'

import { revalidatePath } from 'next/cache'
import { updateProfile } from '@/lib/services/business'
import { settingsSchema } from '@/lib/validation/content'
import { validationFailure, type ActionResult } from '@/lib/validation/result'

/** Save account preferences. Re-validated on the server. */
export async function saveSettings(input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const result = await updateProfile({
    preferred_language: parsed.data.preferredLanguage,
    product_update_emails: parsed.data.productUpdateEmails,
  })
  if (!result.ok) return result
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'settings.saved' }
}
