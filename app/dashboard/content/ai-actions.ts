'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getTemplates } from '@/lib/data/content'
import { AI_ERROR_MESSAGES } from '@/lib/ai/error-messages'
import { withUsage } from '@/lib/billing/usage'
import { buildAIContentRequest, buildMarketingContext } from '@/lib/marketing/context'
import { saveGeneratedCopy } from '@/lib/services/content'
import { aiGenerateSchema, contentIdSchema } from '@/lib/validation/content'
import { validationFailure, type ActionResult } from '@/lib/validation/result'
import { generatedCopySchema } from '@/services/ai/output'
import { generateMarketingContent } from '@/services/ai/service'
import { AIError, type AIContentResponse } from '@/services/ai/types'
import { z } from 'zod'

/*
 * AI generation Server Action. Flow: verify session → resolve the user's OWN business
 * (never a business id from the client) → validate input → load template → build the
 * marketing context → one AI call → validated, normalized output.
 * Nothing is saved here; the owner reviews/edits and then saves explicitly.
 */

export async function generateWithAI(input: unknown): Promise<ActionResult<{ content: AIContentResponse }>> {
  // 1–2. Authenticated user and their own, onboarded business (redirects otherwise).
  const { business, profile } = await requireOnboardedBusiness()

  // 3. Validate (unknown keys such as business_id or owner_id are stripped).
  const parsed = aiGenerateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const values = parsed.data

  // 4. Template: must be an active template (shared, read-only reference data).
  let template = null
  if (values.template_id) {
    template = (await getTemplates()).find((t) => t.id === values.template_id) ?? null
    if (!template) return { ok: false, error: 'ai.error.invalid' }
  }

  // 5. Marketing context from the stored business profile and preferences.
  const context = buildMarketingContext(business, profile)
  const request = buildAIContentRequest(context, values, template, {
    instructions: values.instructions,
    previous: values.previous,
  })

  // 6. Plan limit (Phase 5): one AI text generation is reserved, then charged only on success.
  // 7. One AI call; errors become safe, translated messages.
  return withUsage('ai_text_generation', { type: 'content_type', id: values.content_type }, async () => {
    try {
      const result = await generateMarketingContent(request)
      return { ok: true, data: { content: result.content } }
    } catch (error) {
      const code = error instanceof AIError ? error.code : 'unknown'
      return { ok: false, error: AI_ERROR_MESSAGES[code] }
    }
  })
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
