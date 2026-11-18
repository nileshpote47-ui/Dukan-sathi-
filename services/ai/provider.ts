import 'server-only'
import { AI_PROVIDERS, DEFAULT_GEMINI_MODEL, type AIProviderId } from '@/lib/config/ai'
import { GeminiProvider } from './providers/gemini'
import { MockProvider } from './providers/mock'
import { AIError, type AIProvider } from './types'

/*
 * Chooses the configured provider from server-only environment variables:
 *   AI_PROVIDER = gemini | mock
 *   AI_MODEL    = model id (default for Gemini: DEFAULT_GEMINI_MODEL)
 *   GEMINI_API_KEY = secret (never NEXT_PUBLIC_, never logged)
 * Adding a provider = one file in providers/ + one case here. Nothing else changes.
 */

export interface AIConfig {
  provider: AIProviderId
  model: string
}

/** Configuration without secrets, or null when AI is not set up. Safe to call on any page (no network). */
export function getAIConfig(): AIConfig | null {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (!provider || !(AI_PROVIDERS as readonly string[]).includes(provider)) return null
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) return null
    return { provider, model: process.env.AI_MODEL?.trim() || DEFAULT_GEMINI_MODEL }
  }
  // The test provider must never serve real users.
  if (process.env.VERCEL_ENV === 'production') return null
  return { provider: 'mock', model: 'mock-1' }
}

export const isAIConfigured = () => getAIConfig() !== null

export function getAIProvider(): AIProvider {
  const config = getAIConfig()
  if (!config) throw new AIError('not_configured', 'AI_PROVIDER / API key not configured')
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.model, { apiKey: process.env.GEMINI_API_KEY })
    case 'mock':
      return new MockProvider()
  }
}
