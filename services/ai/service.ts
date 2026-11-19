import 'server-only'
import { getAIProvider } from './provider'
import { AIError, type AIContentRequest, type AIGenerationResult } from './types'
import { log } from '@/lib/observability/log'

/** Rough upper bound for the prompt (input fields are already length-limited by validation). */
const MAX_REQUEST_CHARS = 8_000

/**
 * The one entry point for AI generation. Picks the configured provider, enforces a
 * size limit, makes exactly one call (no automatic retries) and logs only metadata —
 * never prompts, outputs or keys.
 */
export async function generateMarketingContent(request: AIContentRequest): Promise<AIGenerationResult> {
  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    throw new AIError('invalid_request', 'Request too large')
  }

  const provider = getAIProvider()
  const started = Date.now()
  try {
    const content = await provider.generateContent(request)
    log.info('[ai] ok', { provider: provider.id, model: provider.model, type: request.request.type, ms: Date.now() - started })
    return { content, provider: provider.id, model: provider.model }
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError('unknown', 'Unexpected AI error', { cause: error })
    log.error('[ai] failed', {
      provider: provider.id,
      model: provider.model,
      type: request.request.type,
      code: aiError.code,
      reason: aiError.message,
      // Provider's short error text (no prompt, output or key) to tell overload from misconfiguration.
      detail: aiError.cause instanceof Error ? aiError.cause.message.slice(0, 300) : undefined,
      ms: Date.now() - started,
    })
    throw aiError
  }
}
