import type { MessageKey } from '@/lib/i18n'

/** AI providers the app can be configured with (AI_PROVIDER). */
export const AI_PROVIDERS = ['gemini', 'mock'] as const
export type AIProviderId = (typeof AI_PROVIDERS)[number]

/** Used when AI_MODEL is not set. Verified with real requests in Phase 3 (gemini-3.8-flash and gemini-3.5-flash returned 503/504 under high demand; the lite model answers short copy in ~1.5 s). */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

/** One generation request may not run longer than this (no automatic retries). */
export const AI_TIMEOUT_MS = 45_000

/** Owner's extra instructions ("Make it shorter") — kept short to bound prompt size and cost. */
export const AI_INSTRUCTIONS_MAX = 300

/** Quick suggestions shown with Regenerate. Labels live in lib/i18n/messages (ai.suggest.*). */
export const REGENERATE_SUGGESTIONS: { key: MessageKey; instruction: string }[] = [
  { key: 'ai.suggest.shorter', instruction: 'Make it shorter.' },
  { key: 'ai.suggest.local', instruction: 'Make it sound more local and familiar.' },
  { key: 'ai.suggest.premium', instruction: 'Make it more premium and polished.' },
  { key: 'ai.suggest.energetic', instruction: 'Make it more energetic, without spam.' },
  { key: 'ai.suggest.simpler', instruction: 'Use simpler, everyday words.' },
  { key: 'ai.suggest.another', instruction: 'Give me a different version.' },
]
