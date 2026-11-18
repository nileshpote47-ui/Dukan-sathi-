/**
 * AI service boundary — TYPES ONLY in Phase 1.
 *
 * There is deliberately no provider implementation and no API call here.
 * Phase 3 will add providers (e.g. services/ai/providers/<name>.ts) that implement
 * these interfaces, so the rest of the app never imports an AI vendor SDK directly.
 */
import type { LanguageCode } from '@/lib/config/languages'

/** What the app knows about a business, passed to any AI capability. */
export interface BusinessContext {
  name: string
  category: string
  location?: string
  description?: string
  tagline?: string
  language: LanguageCode
}

export interface TextGenerationRequest {
  business: BusinessContext
  /** e.g. 'caption', 'offer', 'whatsapp_message', 'festival_post' */
  kind: string
  instructions: string
  maxLength?: number
}

export interface TextGenerationResult {
  text: string
  /** Provider-reported usage, for future credit accounting (Phase 5). */
  usage?: { inputUnits: number; outputUnits: number }
}

/**
 * A provider implements only the capabilities it supports.
 * Image, video and translation capabilities will be added in later phases.
 */
export interface AIProvider {
  readonly id: string
  generateText?(request: TextGenerationRequest): Promise<TextGenerationResult>
}
