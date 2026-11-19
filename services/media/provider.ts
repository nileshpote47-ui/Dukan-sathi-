import 'server-only'
import { DEFAULT_GEMINI_IMAGE_MODEL, MEDIA_PROVIDERS, type MediaProviderId } from '@/lib/config/media'
import { AIError } from '@/services/ai/types'
import { GeminiImageProvider } from './providers/gemini'
import { MockMediaProvider } from './providers/mock'
import type { MediaProvider } from './types'

/*
 * Chooses the image provider from server-only environment variables:
 *   MEDIA_PROVIDER = gemini | mock   (unset = AI pictures off; posters still work)
 *   MEDIA_MODEL    = model id (default for Gemini: DEFAULT_GEMINI_IMAGE_MODEL)
 *   GEMINI_API_KEY = the Phase 3 secret (never NEXT_PUBLIC_, never logged)
 * Adding a provider = one file in providers/ + one case here.
 */

export interface MediaConfig {
  provider: MediaProviderId
  model: string
}

/** Configuration without secrets, or null when AI pictures are off. No network. */
export function getMediaConfig(): MediaConfig | null {
  const provider = process.env.MEDIA_PROVIDER?.trim().toLowerCase()
  if (!provider || !(MEDIA_PROVIDERS as readonly string[]).includes(provider)) return null
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) return null
    return { provider, model: process.env.MEDIA_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL }
  }
  // The test provider must never serve real users.
  if (process.env.VERCEL_ENV === 'production') return null
  return { provider: 'mock', model: 'mock-image-1' }
}

export const isImageGenerationConfigured = () => getMediaConfig() !== null

export function getMediaProvider(): MediaProvider {
  const config = getMediaConfig()
  if (!config) throw new AIError('not_configured', 'MEDIA_PROVIDER / API key not configured')
  switch (config.provider) {
    case 'gemini':
      return new GeminiImageProvider(config.model, { apiKey: process.env.GEMINI_API_KEY })
    case 'mock':
      return new MockMediaProvider()
  }
}
