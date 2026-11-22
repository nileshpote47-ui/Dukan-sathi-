import 'server-only'
import { VOICE_LANGUAGE_CODES, VOICES, type VoiceId } from '@/lib/config/voiceover'
import type { LanguageCode } from '@/lib/config/languages'
import { isMp3 } from '@/lib/media/audio-file'
import { log } from '@/lib/observability/log'
import { AIError } from '@/services/ai/types'
import { getVoiceProvider } from './provider'

/**
 * The only entry point for voiceovers. Call after resolving the owner's content on the server,
 * on an explicit tap, inside withUsage('voiceover'). Reads the owner's text word for word.
 */
export async function generateVoiceover(input: { text: string; language: LanguageCode; voice: VoiceId }) {
  const provider = getVoiceProvider()
  const speaker = VOICES.find((v) => v.id === input.voice)!.speaker
  const started = Date.now()
  try {
    const result = await provider.synthesize({ text: input.text, languageCode: VOICE_LANGUAGE_CODES[input.language], speaker })
    if (!isMp3(result.bytes)) throw new AIError('invalid_response', 'Voice provider returned a file that is not MP3')
    log.info('[voice] generated', { provider: provider.id, model: provider.model, chars: input.text.length, ms: Date.now() - started })
    return { bytes: result.bytes, provider: provider.id, model: provider.model, speaker }
  } catch (error) {
    const code = error instanceof AIError ? error.code : 'unknown'
    log.error('[voice] failed', { provider: provider.id, code, reason: error instanceof Error ? error.message : 'unknown', ms: Date.now() - started })
    throw error instanceof AIError ? error : new AIError('unknown', 'Voiceover failed', { cause: error })
  }
}
