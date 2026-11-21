import 'server-only'
import { DIRECT_POSTER_NATIVE_SIZES, DIRECT_POSTER_TIMEOUT_MS } from '@/lib/config/media'
import { AIError } from '@/services/ai/types'
import type { ImageGenerationRequest, ImageGenerationResponse, MediaProvider } from '../types'

/*
 * OpenAI image generation (GPT Image) for direct posters. Plain HTTPS (no SDK):
 * POST /v1/images/generations with the server-only OPENAI_API_KEY. One call, no retries.
 * The key and prompts are never logged; errors become provider-independent AIError codes.
 */
const ENDPOINT = 'https://api.openai.com/v1/images/generations'

export class OpenAIImageProvider implements MediaProvider {
  readonly id = 'openai'

  constructor(
    readonly model: string,
    private readonly options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
  ) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!this.options.apiKey) throw new AIError('not_configured', 'OPENAI_API_KEY is not set')
    const doFetch = this.options.fetchImpl ?? fetch
    let response: Response
    try {
      response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({ model: this.model, prompt: request.prompt, size: DIRECT_POSTER_NATIVE_SIZES[request.aspectRatio], n: 1 }),
        signal: AbortSignal.timeout(DIRECT_POSTER_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AIError('timeout', 'OpenAI image request timed out', { cause: error })
      }
      throw new AIError('unavailable', 'OpenAI image request failed', { cause: error })
    }

    const text = await response.text()
    if (!response.ok) throw openAIError(response.status, text)

    let image: string | undefined
    try {
      image = (JSON.parse(text) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json
    } catch (error) {
      throw new AIError('invalid_response', 'OpenAI returned invalid JSON', { cause: error })
    }
    if (!image) throw new AIError('empty_response', 'OpenAI returned no image')
    return { bytes: new Uint8Array(Buffer.from(image, 'base64')), mimeType: 'image/png' }
  }
}

/** Maps an OpenAI HTTP error to a safe code. Only the provider's error code/type is kept for logs. */
export function openAIError(status: number, body: string): AIError {
  let code = ''
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; type?: string } }
    code = `${parsed.error?.code ?? ''} ${parsed.error?.type ?? ''}`.trim()
  } catch {
    // Non-JSON error body: keep only the status.
  }
  const reason = `OpenAI image error ${status}${code ? ` (${code.slice(0, 80)})` : ''}`
  if (status === 401 || status === 403) return new AIError('not_configured', reason)
  if (status === 429) return new AIError('rate_limited', reason)
  if (status === 400 && /moderation|safety|content_policy/i.test(code)) return new AIError('blocked', reason)
  if (status === 400 || status === 404 || status === 422) return new AIError('invalid_request', reason)
  if (status === 408 || status === 504) return new AIError('timeout', reason)
  if (status >= 500) return new AIError('unavailable', reason)
  return new AIError('unknown', reason)
}
