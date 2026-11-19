import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai'
import { AI_TIMEOUT_MS } from '@/lib/config/ai'
import { normalizeAIOutput, outputJsonSchema } from '../output'
import { buildPrompt } from '../prompts'
import { AIError, type AIContentRequest, type AIContentResponse, type AIProvider } from '../types'
import { log } from '@/lib/observability/log'

/**
 * Google Gemini provider (Gemini Developer API, @google/genai).
 * Everything Gemini-specific stays in this file: structured JSON output, finish
 * reasons and API errors are translated into the app's own types.
 */

/** The part of the SDK client this provider uses (lets tests pass a fake). */
export interface GeminiClient {
  models: {
    generateContent(params: Parameters<GoogleGenAI['models']['generateContent']>[0]): Promise<{
      text?: string
      candidates?: { finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
      usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number }
    }>
  }
}

/** Finish reasons that mean the provider refused to answer. Shared with the image provider. */
export const BLOCKED_FINISH_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
])

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'
  private readonly client: GeminiClient

  constructor(
    readonly model: string,
    options: { apiKey?: string; client?: GeminiClient },
  ) {
    if (options.client) {
      this.client = options.client
    } else {
      if (!options.apiKey) throw new AIError('not_configured', 'GEMINI_API_KEY is not set')
      this.client = new GoogleGenAI({ apiKey: options.apiKey })
    }
  }

  async generateContent(request: AIContentRequest): Promise<AIContentResponse> {
    const prompt = buildPrompt(request)
    let response: Awaited<ReturnType<GeminiClient['models']['generateContent']>>
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt.user,
        config: {
          systemInstruction: prompt.system,
          responseMimeType: 'application/json',
          responseJsonSchema: outputJsonSchema(request.request.type),
          // A little more variety when the owner asks for another version.
          temperature: request.generation.previous ? 1.0 : 0.7,
          // Bounds time and cost: a runaway reply fails fast instead of running to the deadline.
          maxOutputTokens: 1024,
          // Short marketing copy needs no deep reasoning; higher thinking levels made requests
          // (especially reel scripts) slow enough to hit the deadline. Gemini 3 models take thinkingLevel.
          ...(this.model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
          httpOptions: {
            timeout: AI_TIMEOUT_MS,
            // Each call may cost money: no automatic retries (the owner can press Regenerate).
            retryOptions: { attempts: 1 },
          },
        },
      })
    } catch (error) {
      throw toAIError(error)
    }

    // Token counts only (no text), to spot slow or runaway replies in the logs.
    log.info('[ai] usage', {
      model: this.model,
      thoughts: response.usageMetadata?.thoughtsTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
      finish: response.candidates?.[0]?.finishReason,
    })
    if (response.promptFeedback?.blockReason) {
      throw new AIError('blocked', `Prompt blocked: ${response.promptFeedback.blockReason}`)
    }
    const finishReason = response.candidates?.[0]?.finishReason
    if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
      throw new AIError('blocked', `Response blocked: ${finishReason}`)
    }
    if (!response.text?.trim()) {
      throw new AIError('empty_response', `Empty response (finish reason: ${finishReason ?? 'none'})`)
    }
    return normalizeAIOutput(request.request.type, response.text)
  }
}

/** Translate SDK / network errors into AIError codes. */
export function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error
  if (error instanceof ApiError || (error && typeof error === 'object' && 'status' in error)) {
    const status = Number((error as { status: unknown }).status)
    if (status === 429) return new AIError('rate_limited', 'Gemini rate limit or quota exceeded', { cause: error })
    if (status === 401 || status === 403) return new AIError('not_configured', 'Gemini rejected the API key', { cause: error })
    if (status === 404) return new AIError('not_configured', 'Gemini model not found (check AI_MODEL)', { cause: error })
    if (status === 400) return new AIError('invalid_request', 'Gemini rejected the request', { cause: error })
    if (status === 408 || status === 504) return new AIError('timeout', 'Gemini timed out', { cause: error })
    if (status >= 500) return new AIError('unavailable', `Gemini unavailable (${status})`, { cause: error })
  }
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out/i.test(message)) {
    return new AIError('timeout', 'Gemini request timed out', { cause: error })
  }
  if (/fetch failed|ECONNRESET|ENOTFOUND|ECONNREFUSED|network/i.test(message)) {
    return new AIError('unavailable', 'Could not reach Gemini', { cause: error })
  }
  return new AIError('unknown', 'Unexpected Gemini error', { cause: error })
}
