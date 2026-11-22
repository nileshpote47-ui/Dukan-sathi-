import 'server-only'
import { VOICE_TIMEOUT_MS } from '@/lib/config/voiceover'
import { AIError } from '@/services/ai/types'
import type { SpeechRequest, SpeechResponse, VoiceProvider } from '../types'

/*
 * Sarvam AI text-to-speech (Bulbul), made for Indian languages. Plain HTTPS (no SDK):
 * POST /text-to-speech with the server-only SARVAM_API_KEY in the api-subscription-key header.
 * One call, no retries; MP3 output. The key and the text are never logged.
 */
const ENDPOINT = 'https://api.sarvam.ai/text-to-speech'

export class SarvamVoiceProvider implements VoiceProvider {
  readonly id = 'sarvam'

  constructor(
    readonly model: string,
    private readonly options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
  ) {}

  async synthesize(request: SpeechRequest): Promise<SpeechResponse> {
    if (!this.options.apiKey) throw new AIError('not_configured', 'SARVAM_API_KEY is not set')
    const doFetch = this.options.fetchImpl ?? fetch
    let response: Response
    try {
      response = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': this.options.apiKey },
        body: JSON.stringify({
          text: request.text,
          language_code: request.languageCode,
          speaker: request.speaker,
          model: this.model,
          output_audio_codec: 'mp3',
          // Reads numbers, prices and dates naturally in the chosen language.
          enable_preprocessing: true,
        }),
        signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AIError('timeout', 'Sarvam speech request timed out', { cause: error })
      }
      throw new AIError('unavailable', 'Sarvam speech request failed', { cause: error })
    }

    const text = await response.text()
    if (!response.ok) throw sarvamError(response.status, text)

    let audios: string[] | undefined
    try {
      audios = (JSON.parse(text) as { audios?: string[] }).audios
    } catch (error) {
      throw new AIError('invalid_response', 'Sarvam returned invalid JSON', { cause: error })
    }
    if (!audios?.length || !audios.join('')) throw new AIError('empty_response', 'Sarvam returned no audio')
    return { bytes: new Uint8Array(Buffer.from(audios.join(''), 'base64')), mimeType: 'audio/mpeg' }
  }
}

/** Maps a Sarvam HTTP error to a safe code. Only the provider's error code is kept for logs. */
export function sarvamError(status: number, body: string): AIError {
  let code = ''
  try {
    code = (JSON.parse(body) as { error?: { code?: string } }).error?.code ?? ''
  } catch {
    // Non-JSON error body: keep only the status.
  }
  const reason = `Sarvam speech error ${status}${code ? ` (${code.slice(0, 60)})` : ''}`
  if (status === 401 || status === 403) return new AIError('not_configured', reason)
  // 402: credits used up on the Sarvam account — the owner of the app must top up.
  if (status === 402) return new AIError('unavailable', reason)
  if (status === 429) return new AIError('rate_limited', reason)
  if (status === 400 || status === 404 || status === 422) return new AIError('invalid_request', reason)
  if (status === 408 || status === 504) return new AIError('timeout', reason)
  if (status >= 500) return new AIError('unavailable', reason)
  return new AIError('unknown', reason)
}
