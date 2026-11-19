import { GoogleGenAI } from '@google/genai'
import { MEDIA_TIMEOUT_MS, type AspectRatio } from '@/lib/config/media'
import { BLOCKED_FINISH_REASONS, toAIError } from '@/services/ai/providers/gemini'
import { AIError } from '@/services/ai/types'
import type { ImageGenerationRequest, ImageGenerationResponse, MediaProvider } from '../types'

/**
 * Google Gemini image provider (Gemini Developer API, @google/genai). Reuses the
 * Phase 3 key (GEMINI_API_KEY) and error mapping. Everything Gemini-specific stays here.
 */

/** The part of the SDK client this provider uses (lets tests pass a fake). */
export interface GeminiImageClient {
  models: {
    generateContent(params: Parameters<GoogleGenAI['models']['generateContent']>[0]): Promise<{
      candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
      promptFeedback?: { blockReason?: string }
    }>
  }
}

/** Gemini accepts a fixed list of ratios; 4:5 is drawn from a 3:4 picture (cropped by the template). */
const GEMINI_RATIOS: Record<AspectRatio, string> = { '1:1': '1:1', '4:5': '3:4', '9:16': '9:16', '16:9': '16:9' }

export class GeminiImageProvider implements MediaProvider {
  readonly id = 'gemini'
  private readonly client: GeminiImageClient

  constructor(
    readonly model: string,
    options: { apiKey?: string; client?: GeminiImageClient },
  ) {
    if (options.client) {
      this.client = options.client
    } else {
      if (!options.apiKey) throw new AIError('not_configured', 'GEMINI_API_KEY is not set')
      this.client = new GoogleGenAI({ apiKey: options.apiKey })
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    let response: Awaited<ReturnType<GeminiImageClient['models']['generateContent']>>
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: request.prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: GEMINI_RATIOS[request.aspectRatio] },
          httpOptions: {
            timeout: MEDIA_TIMEOUT_MS,
            // Each picture may cost money: no automatic retries.
            retryOptions: { attempts: 1 },
          },
        },
      })
    } catch (error) {
      throw toAIError(error)
    }

    if (response.promptFeedback?.blockReason) {
      throw new AIError('blocked', `Prompt blocked: ${response.promptFeedback.blockReason}`)
    }
    const candidate = response.candidates?.[0]
    if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
      throw new AIError('blocked', `Image blocked: ${candidate.finishReason}`)
    }
    const image = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    if (!image?.data) {
      throw new AIError('empty_response', `No image returned (finish reason: ${candidate?.finishReason ?? 'none'})`)
    }
    return { bytes: new Uint8Array(Buffer.from(image.data, 'base64')), mimeType: image.mimeType ?? 'application/octet-stream' }
  }
}
