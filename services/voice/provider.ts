import 'server-only'
import { DEFAULT_VOICE_MODEL, type VoiceProviderId } from '@/lib/config/voiceover'
import { AIError } from '@/services/ai/types'
import { MockVoiceProvider } from './providers/mock'
import { SarvamVoiceProvider } from './providers/sarvam'
import type { VoiceProvider } from './types'

/** VOICE_PROVIDER = sarvam | mock; unset = sarvam when SARVAM_API_KEY is set, otherwise voiceover is off. */
export function getVoiceConfig(): { provider: VoiceProviderId; model: string } | null {
  const chosen = process.env.VOICE_PROVIDER?.trim().toLowerCase() || (process.env.SARVAM_API_KEY ? 'sarvam' : '')
  if (chosen === 'sarvam') {
    if (!process.env.SARVAM_API_KEY) return null
    return { provider: 'sarvam', model: process.env.VOICE_MODEL?.trim() || DEFAULT_VOICE_MODEL }
  }
  // The test provider must never serve real users.
  if (chosen === 'mock' && process.env.VERCEL_ENV !== 'production') return { provider: 'mock', model: 'mock-voice-1' }
  return null
}

export const isVoiceConfigured = () => getVoiceConfig() !== null

export function getVoiceProvider(): VoiceProvider {
  const config = getVoiceConfig()
  if (!config) throw new AIError('not_configured', 'Voiceover is not configured')
  return config.provider === 'sarvam' ? new SarvamVoiceProvider(config.model, { apiKey: process.env.SARVAM_API_KEY }) : new MockVoiceProvider()
}
