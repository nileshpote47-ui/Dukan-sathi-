/**
 * AI service boundary — TYPES ONLY (no provider, no API calls) until Phase 3.
 *
 * Phase 2 prepares the structured input: lib/marketing/context.ts builds a
 * MarketingGenerationRequest from the business, its marketing preferences and a
 * content item. Phase 3 adds providers (services/ai/providers/<name>.ts) that
 * implement AIProvider, so the rest of the app never imports a vendor SDK.
 */
import type { ContentType } from '@/lib/config/content'
import type { LanguageCode } from '@/lib/config/languages'
import type { ContactMethod, PromotionalStyle, Tone } from '@/lib/config/marketing'

/** Everything the app knows about the business that should shape its marketing. */
export interface MarketingContext {
  business: {
    name: string
    category: string
    location?: string
    description?: string
    tagline?: string
    targetCustomers?: string
    phone?: string
    whatsapp?: string
    openingHours?: string
  }
  preferences: {
    language: LanguageCode
    tone?: Tone
    callToAction?: string
    promotionalStyle?: PromotionalStyle
    contactMethod?: ContactMethod
  }
}

/** One content request, as the owner described it (no generated text). */
export interface ContentRequest {
  contentItemId: string
  type: ContentType
  title: string
  language: LanguageCode
  product?: string
  offer?: string
  price?: string
  description?: string
  notes?: string
  callToAction?: string
  template?: { slug: string; name: string; contentType: ContentType }
}

/** The complete input a future AI provider receives. */
export interface MarketingGenerationRequest {
  context: MarketingContext
  request: ContentRequest
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
  generateText?(request: MarketingGenerationRequest): Promise<TextGenerationResult>
}
