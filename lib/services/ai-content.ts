import 'server-only'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { AI_ERROR_MESSAGES } from '@/lib/ai/error-messages'
import { withUsage } from '@/lib/billing/usage'
import { getTemplates } from '@/lib/data/content'
import { buildAIContentRequest, buildMarketingContext, type ContentRequestInput } from '@/lib/marketing/context'
import type { ActionResult } from '@/lib/validation/result'
import { generateMarketingContent } from '@/services/ai/service'
import { AIError, type AIContentResponse } from '@/services/ai/types'

/*
 * One AI text generation for the signed-in owner's OWN business (resolved here, never from the
 * client): template lookup → marketing context → plan limit + burst limit (withUsage) → one AI
 * call → validated copy. Shared by the edit page, the dashboard composer and the content page.
 * Nothing is saved here.
 */
export async function generateCopy(
  item: ContentRequestInput & { template_id?: string | null },
  options: { instructions?: string | null; previous?: AIContentResponse | null } = {},
): Promise<ActionResult<{ content: AIContentResponse }>> {
  const { business, profile } = await requireOnboardedBusiness()

  let template = null
  if (item.template_id) {
    template = (await getTemplates()).find((t) => t.id === item.template_id) ?? null
    if (!template) return { ok: false, error: 'ai.error.invalid' }
  }

  const request = buildAIContentRequest(buildMarketingContext(business, profile), item, template, options)
  return withUsage('ai_text_generation', { type: 'content_type', id: item.content_type }, async () => {
    try {
      const result = await generateMarketingContent(request)
      return { ok: true, data: { content: result.content } }
    } catch (error) {
      const code = error instanceof AIError ? error.code : 'unknown'
      return { ok: false, error: AI_ERROR_MESSAGES[code] }
    }
  })
}
