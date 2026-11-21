'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { quickCreateFormInput } from '@/lib/content/quick-title'
import { getContentItem } from '@/lib/data/content'
import type { MessageKey } from '@/lib/i18n'
import { generateCopy } from '@/lib/services/ai-content'
import { createContentItem, saveGeneratedCopy } from '@/lib/services/content'
import { aiGenerateSchema, contentFormSchema, contentIdSchema, quickCreateSchema } from '@/lib/validation/content'
import { validationFailure, type ActionResult } from '@/lib/validation/result'
import { generatedCopySchema, hasGeneratedCopy } from '@/services/ai/output'
import type { AIContentResponse } from '@/services/ai/types'
import { z } from 'zod'

/*
 * AI generation Server Action. Flow: verify session → resolve the user's OWN business
 * (never a business id from the client) → validate input → load template → build the
 * marketing context → one AI call → validated, normalized output.
 * Nothing is saved here; the owner reviews/edits and then saves explicitly.
 */

export async function generateWithAI(input: unknown): Promise<ActionResult<{ content: AIContentResponse }>> {
  // Authenticated user and their own, onboarded business (redirects otherwise).
  await requireOnboardedBusiness()
  // Validate (unknown keys such as business_id or owner_id are stripped).
  const parsed = aiGenerateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const { instructions, previous, ...values } = parsed.data
  return generateCopy(values, { instructions, previous })
}

/**
 * Dashboard composer: the owner's sentence becomes a draft (their words kept as the
 * description, title from its first clause), then one AI generation writes its copy.
 * The draft is kept even if the AI step fails, and the reason is returned.
 */
export async function quickCreateWithAI(input: unknown): Promise<ActionResult<{ id: string; aiError: MessageKey | null }>> {
  await requireOnboardedBusiness()
  const parsed = quickCreateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const { brief, content_type, language } = parsed.data

  const form = contentFormSchema.safeParse(quickCreateFormInput(brief, content_type, language))
  if (!form.success) return validationFailure(form.error)
  const created = await createContentItem(form.data)
  if (!created.ok) return created

  const id = created.data!.id
  const generated = await generateCopy({ ...form.data, id })
  let aiError: MessageKey | null = null
  if (!generated.ok) aiError = generated.error
  else {
    const saved = await saveGeneratedCopy(id, generated.data!.content, true)
    if (!saved.ok) aiError = saved.error
  }
  revalidatePath('/dashboard', 'layout')
  return { ok: true, data: { id, aiError } }
}

/** Content page: write AI copy for an item that has none yet (explicit owner action, one call). */
export async function writeCopyForContent(id: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsedId = contentIdSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: 'errors.contentNotFound' }
  const item = await getContentItem(parsedId.data)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }
  if (hasGeneratedCopy(item.generated_copy as AIContentResponse | null)) return { ok: false, error: 'ai.copyExists' }

  const generated = await generateCopy(item)
  if (!generated.ok) return generated
  const saved = await saveGeneratedCopy(item.id, generated.data!.content, true)
  if (!saved.ok) return saved
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'ai.copySaved' }
}

const saveCopySchema = z.object({
  id: contentIdSchema,
  copy: generatedCopySchema.nullable(),
  regenerated: z.boolean(),
})

/** Save AI copy on an existing content item (edit page). */
export async function saveContentCopy(input: unknown): Promise<ActionResult> {
  const parsed = saveCopySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const result = await saveGeneratedCopy(parsed.data.id, parsed.data.copy, parsed.data.regenerated)
  if (!result.ok) return result
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'ai.copySaved' }
}
