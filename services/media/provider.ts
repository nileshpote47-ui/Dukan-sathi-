import 'server-only'
import { DEFAULT_DIRECT_POSTER_MODEL, DEFAULT_GEMINI_IMAGE_MODEL, MEDIA_PROVIDERS, type DirectPosterProviderId, type MediaProviderId } from '@/lib/config/media'
import { AIError } from '@/services/ai/types'
import { GeminiImageProvider } from './providers/gemini'
import { MockMediaProvider } from './providers/mock'
import { OpenAIImageProvider } from './providers/openai'
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

/*
 * Direct posters (Phase 9): a separate provider choice from AI pictures.
 *   DIRECT_POSTER_PROVIDER = openai | mock   (unset = openai when OPENAI_API_KEY is set, else off)
 *   DIRECT_POSTER_MODEL    = model id (default DEFAULT_DIRECT_POSTER_MODEL)
 *   OPENAI_API_KEY         = server-only secret (Vercel Sensitive; never NEXT_PUBLIC_, never logged)
 */
export function getDirectPosterConfig(): { provider: DirectPosterProviderId; model: string } | null {
  const chosen = process.env.DIRECT_POSTER_PROVIDER?.trim().toLowerCase() || (process.env.OPENAI_API_KEY ? 'openai' : '')
  if (chosen === 'openai') {
    if (!process.env.OPENAI_API_KEY) return null
    return { provider: 'openai', model: process.env.DIRECT_POSTER_MODEL?.trim() || DEFAULT_DIRECT_POSTER_MODEL }
  }
  // The test provider must never serve real users.
  if (chosen === 'mock' && process.env.VERCEL_ENV !== 'production') return { provider: 'mock', model: 'mock-poster-1' }
  return null
}

export const isDirectPosterConfigured = () => getDirectPosterConfig() !== null

export function getDirectPosterProvider(): MediaProvider {
  const config = getDirectPosterConfig()
  if (!config) throw new AIError('not_configured', 'Direct posters are not configured')
  return config.provider === 'openai' ? new OpenAIImageProvider(config.model, { apiKey: process.env.OPENAI_API_KEY }) : new MockMediaProvider()
}
