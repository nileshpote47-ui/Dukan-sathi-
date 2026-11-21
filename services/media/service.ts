import 'server-only'
import { validateImage, type ImageInfo } from '@/lib/media/image-file'
import { AIError } from '@/services/ai/types'
import { padToAspect } from '@/lib/media/fit-aspect'
import { getDirectPosterProvider, getMediaProvider } from './provider'
import type { ImageGenerationRequest } from './types'
import { log } from '@/lib/observability/log'

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
    log.info('[media] ok', { provider: provider.id, model: provider.model, ratio: request.aspectRatio, bytes: checked.info.size, ms: Date.now() - started })
    return { bytes: result.bytes, info: checked.info, provider: provider.id, model: provider.model }
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError('unknown', 'Unexpected media error', { cause: error })
    log.error('[media] failed', {
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

/**
 * The one entry point for direct posters (Phase 9): one call to the direct-poster provider
 * (no automatic retries), then the result is padded to the chosen size (never cropped) and
 * checked like any picture. Logs metadata only — never prompts, text or images.
 */
export async function generateDirectPoster(request: ImageGenerationRequest): Promise<GeneratedImage> {
  if (request.prompt.length > MAX_PROMPT_CHARS) throw new AIError('invalid_request', 'Prompt too large')

  const provider = getDirectPosterProvider()
  const started = Date.now()
  try {
    const result = await provider.generateImage(request)
    const first = validateImage(result.bytes)
    if (!first.ok) throw new AIError(first.problem === 'empty' ? 'empty_response' : 'invalid_response', `Unusable image (${first.problem})`)
    const fitted = await padToAspect(result.bytes, request.aspectRatio).catch((error: unknown) => {
      throw new AIError('invalid_response', 'Could not fit the poster to its size', { cause: error })
    })
    const checked = validateImage(fitted)
    if (!checked.ok) throw new AIError('invalid_response', `Unusable poster (${checked.problem})`)
    log.info('[media] direct poster ok', { provider: provider.id, model: provider.model, ratio: request.aspectRatio, bytes: checked.info.size, ms: Date.now() - started })
    return { bytes: fitted, info: checked.info, provider: provider.id, model: provider.model }
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError('unknown', 'Unexpected direct poster error', { cause: error })
    log.error('[media] direct poster failed', {
      provider: provider.id,
      model: provider.model,
      ratio: request.aspectRatio,
      code: aiError.code,
      reason: aiError.message,
      ms: Date.now() - started,
    })
    throw aiError
  }
}
