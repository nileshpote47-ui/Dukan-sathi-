'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import {
  addWhatsAppContact,
  completeWhatsAppSignup,
  deleteWhatsAppContact,
  disconnectAccount,
  optOutWhatsAppContact,
} from '@/lib/services/publishing'
import { validationFailure, type ActionResult } from '@/lib/validation/result'
import { contactInputSchema, idSchema, whatsappSignupSchema } from '@/lib/validation/publishing'

/* Accounts and WhatsApp customers. Every action re-checks the session; ownership comes from it. */

export async function disconnectAccountAction(accountId: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(accountId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  const result = await disconnectAccount(id.data)
  revalidatePath('/dashboard/accounts')
  return result.ok ? { ok: true, message: 'publishing.accounts.disconnected' } : result
}

/** Embedded Signup finished in the browser: exchange the code on the server. */
export async function connectWhatsAppAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  await requireOnboardedBusiness()
  const parsed = whatsappSignupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'publishing.accounts.connectFailed' }
  const result = await completeWhatsAppSignup(parsed.data)
  revalidatePath('/dashboard/accounts')
  return result.ok ? { ok: true, data: { count: result.count } } : result
}

export async function addContactAction(input: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = contactInputSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const result = await addWhatsAppContact(parsed.data)
  revalidatePath('/dashboard/accounts/whatsapp')
  return result.ok ? { ok: true, message: 'publishing.contacts.added' } : result
}

export async function optOutContactAction(contactId: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(contactId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  const result = await optOutWhatsAppContact(id.data)
  revalidatePath('/dashboard/accounts/whatsapp')
  return result.ok ? { ok: true, message: 'publishing.contacts.updated' } : result
}

export async function deleteContactAction(contactId: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const id = idSchema.safeParse(contactId)
  if (!id.success) return { ok: false, error: 'errors.validation' }
  const result = await deleteWhatsAppContact(id.data)
  revalidatePath('/dashboard/accounts/whatsapp')
  return result.ok ? { ok: true, message: 'publishing.contacts.updated' } : result
}
