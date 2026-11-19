import 'server-only'
import { validateImage, type ImageInfo } from '@/lib/media/image-file'
import { AIError } from '@/services/ai/types'
import { getMediaProvider } from './provider'
import type { ImageGenerationRequest } from './types'

/** Rough upper bound for an image prompt (inputs are already length-limited). */
const MAX_PROMPT_CHARS = 3_000

export interface GeneratedImage {
  bytes: Uint8Array
  info: ImageInfo
  provider: string
  model: string
}

/**
 * The one entry point for AI pictures. Picks the configured provider, makes exactly one
 * call (no automatic retries), checks that the result really is an acceptable image,
 * and logs only metadata — never prompts, images or keys.
 */
export async function generateMarketingImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
  if (request.prompt.length > MAX_PROMPT_CHARS) throw new AIError('invalid_request', 'Prompt too large')

  const provider = getMediaProvider()
  const started = Date.now()
  try {
    const result = await provider.generateImage(request)
    const checked = validateImage(result.bytes)
    if (!checked.ok) {
      throw new AIError(checked.problem === 'empty' ? 'empty_response' : 'invalid_response', `Unusable image (${checked.problem})`)
    }
    console.info('[media] ok', { provider: provider.id, model: provider.model, ratio: request.aspectRatio, bytes: checked.info.size, ms: Date.now() - started })
    return { bytes: result.bytes, info: checked.info, provider: provider.id, model: provider.model }
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError('unknown', 'Unexpected media error', { cause: error })
    console.error('[media] failed', {
      provider: provider.id,
      model: provider.model,
      ratio: request.aspectRatio,
      code: aiError.code,
      reason: aiError.message,
      detail: aiError.cause instanceof Error ? aiError.cause.message.slice(0, 300) : undefined,
      ms: Date.now() - started,
    })
    throw aiError
  }
}
