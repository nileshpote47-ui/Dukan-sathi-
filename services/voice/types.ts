/**
 * Voice service boundary (Phase 9, Stage 3b). The app depends only on these types; the
 * text-to-speech vendor lives in services/voice/providers/* and never reaches pages or components.
 * Errors reuse AIError codes (services/ai/types.ts) so the same friendly messages apply.
 */
export interface SpeechRequest {
  /** The owner's own voiceover lines, joined; never written by the app. */
  text: string
  /** BCP-47, e.g. "mr-IN". */
  languageCode: string
  /** Provider speaker id, from lib/config/voiceover.ts. */
  speaker: string
}

export interface SpeechResponse {
  bytes: Uint8Array
  mimeType: 'audio/mpeg'
}

export interface VoiceProvider {
  readonly id: string
  readonly model: string
  /** One call, no automatic retries. Throws AIError. */
  synthesize(request: SpeechRequest): Promise<SpeechResponse>
}
