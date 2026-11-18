'use server'

import { revalidatePath } from 'next/cache'
import { updateBusiness, updateProfile } from '@/lib/services/business'
import { businessFormSchema } from '@/lib/validation/business'
import { marketingPreferencesSchema } from '@/lib/validation/content'
import { validationFailure, type ActionResult } from '@/lib/validation/result'

/** Save the My Business form. Re-validates everything on the server. */
export async function saveBusinessProfile(input: unknown): Promise<ActionResult> {
  const parsed = businessFormSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)

  const { ownerName, preferredLanguage, ...business } = parsed.data
  const profileResult = await updateProfile({ full_name: ownerName, preferred_language: preferredLanguage })
  if (!profileResult.ok) return profileResult
  const businessResult = await updateBusiness(business)
  if (!businessResult.ok) return businessResult

  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'business.saved' }
}

/** Save marketing preferences (business level). Re-validated on the server. */
export async function saveMarketingPreferences(input: unknown): Promise<ActionResult> {
  const parsed = marketingPreferencesSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const result = await updateBusiness(parsed.data)
  if (!result.ok) return result
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'marketing.saved' }
}
