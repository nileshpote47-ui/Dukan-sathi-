'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getBusiness } from '@/lib/auth/dal'
import { updateBusiness, updateProfile, upsertBusinessBasics } from '@/lib/services/business'
import {
  basicsSchema,
  brandStepSchema,
  contactStepSchema,
  languageStepSchema,
  locationStepSchema,
} from '@/lib/validation/business'
import { validationFailure, type ActionResult } from '@/lib/validation/result'

/*
 * One action per onboarding step. Each one validates on the server again
 * (client validation is only for convenience) and saves immediately, so a
 * returning user can continue where they stopped.
 */

export async function saveBasics(input: unknown): Promise<ActionResult> {
  const parsed = basicsSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  return upsertBusinessBasics(parsed.data)
}

export async function saveContact(input: unknown): Promise<ActionResult> {
  const parsed = contactStepSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const { ownerName, ...business } = parsed.data
  const profile = await updateProfile({ full_name: ownerName })
  if (!profile.ok) return profile
  return updateBusiness(business)
}

export async function saveLocation(input: unknown): Promise<ActionResult> {
  const parsed = locationStepSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  return updateBusiness(parsed.data)
}

export async function saveLanguage(input: unknown): Promise<ActionResult> {
  const parsed = languageStepSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  return updateProfile({ preferred_language: parsed.data.preferredLanguage })
}

export async function saveBrand(input: unknown): Promise<ActionResult> {
  const parsed = brandStepSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  return updateBusiness(parsed.data)
}

export async function finishOnboarding(): Promise<ActionResult> {
  const business = await getBusiness()
  if (!business) return { ok: false, error: 'errors.saveFailed' }
  if (!business.onboarding_completed_at) {
    const result = await updateBusiness({ onboarding_completed_at: new Date().toISOString() })
    if (!result.ok) return result
  }
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
