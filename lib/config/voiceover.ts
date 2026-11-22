import type { LanguageCode } from './languages'

/*
 * Reel voiceover (Phase 9, Stage 3b). The owner's own voiceover lines from the saved storyboard
 * are read aloud by an Indian-language text-to-speech model (Sarvam Bulbul).
 * VOICE_PROVIDER = sarvam | mock (unset = sarvam when SARVAM_API_KEY is set). mock is refused in production.
 */
export const VOICE_PROVIDERS = ['sarvam', 'mock'] as const
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number]
export const DEFAULT_VOICE_MODEL = 'bulbul:v3'
export const VOICE_TIMEOUT_MS = 60_000

/** Two voices the owner can choose from (Sarvam Bulbul v3 speaker ids). */
export const VOICES = [
  { id: 'female', speaker: 'priya', label: 'voiceover.voice.female' },
  { id: 'male', speaker: 'rahul', label: 'voiceover.voice.male' },
] as const
export type VoiceId = (typeof VOICES)[number]['id']
export const VOICE_IDS = VOICES.map((v) => v.id) as [VoiceId, ...VoiceId[]]
export const DEFAULT_VOICE: VoiceId = 'female'

/** Content language → BCP-47 code the model expects. */
export const VOICE_LANGUAGE_CODES: Record<LanguageCode, string> = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' }

/** The model reads up to 2,500 characters in one call; reels are far shorter. */
export const VOICEOVER_MAX_CHARS = 2400
export const VOICEOVER_MIN_CHARS = 3
export const VOICEOVER_MIME = 'audio/mpeg'
/** Stored under `<owner_id>/voiceovers/` in the private business-media bucket. */
export const VOICEOVER_FOLDER = 'voiceovers'
export const VOICEOVER_MAX_BYTES = 3_500_000
