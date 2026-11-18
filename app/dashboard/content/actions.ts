'use server'

import { revalidatePath } from 'next/cache'
import { isContentStatus } from '@/lib/config/content'
import { changeContentStatus, createContentItem, deleteContentItem, updateContentItem } from '@/lib/services/content'
import { istInputToIso } from '@/lib/utils/datetime'
import { contentFormSchema, contentIdSchema, statusChangeSchema } from '@/lib/validation/content'
import { validationFailure, type ActionResult } from '@/lib/validation/result'

/*
 * Content Server Actions. Each validates its input on the server (client checks are
 * only for convenience) and goes through lib/services/content.ts, which re-checks the
 * signed-in user. No AI generation and no publishing happen here.
 */

const refresh = () => revalidatePath('/dashboard', 'layout')

export async function createContent(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = contentFormSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const result = await createContentItem(parsed.data)
  if (!result.ok) return result
  refresh()
  return { ok: true, data: result.data, message: 'create.saved' }
}

export async function updateContent(id: string, input: unknown): Promise<ActionResult> {
  if (!contentIdSchema.safeParse(id).success) return { ok: false, error: 'errors.contentNotFound' }
  const parsed = contentFormSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const result = await updateContentItem(id, parsed.data)
  if (!result.ok) return result
  refresh()
  return { ok: true, message: 'content.saved' }
}

export async function setContentStatus(input: unknown): Promise<ActionResult> {
  const parsed = statusChangeSchema.safeParse(input)
  if (!parsed.success || !isContentStatus(parsed.data.to)) return { ok: false, error: 'errors.invalidTransition' }
  const { id, to, scheduledFor } = parsed.data

  let scheduledIso: string | null = null
  if (to === 'SCHEDULED') {
    scheduledIso = scheduledFor ? istInputToIso(scheduledFor) : null
    if (!scheduledIso) return { ok: false, error: 'errors.scheduleInvalid' }
  }

  const result = await changeContentStatus(id, to, scheduledIso)
  if (!result.ok) return result
  refresh()
  return { ok: true, message: 'content.statusChanged' }
}

export async function deleteContent(id: string): Promise<ActionResult> {
  if (!contentIdSchema.safeParse(id).success) return { ok: false, error: 'errors.contentNotFound' }
  const result = await deleteContentItem(id)
  if (!result.ok) return result
  refresh()
  return { ok: true, message: 'content.deleted' }
}
