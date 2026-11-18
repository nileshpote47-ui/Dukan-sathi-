/**
 * AI service boundary. The app depends only on these types; provider SDKs live in
 * services/ai/providers/* and never leak into pages, actions or components.
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

/** One content request, as the owner described it. */
export interface ContentRequest {
  contentItemId?: string
  type: ContentType
  title: string
  product?: string
  offer?: string
  price?: string
  description?: string
  notes?: string
  callToAction?: string
  template?: { slug: string; name: string; description?: string; defaultCta?: string; contentType: ContentType }
}

/** Fields of the normalized AI output. Which ones apply depends on the content type. */
export const OUTPUT_FIELDS = ['headline', 'primary_text', 'short_text', 'call_to_action', 'hashtags', 'reel_hook', 'reel_script'] as const
export type OutputField = (typeof OUTPUT_FIELDS)[number]

/** The app's own normalized response — never a provider's raw object. */
export interface AIContentResponse {
  headline?: string
  primary_text?: string
  short_text?: string
  call_to_action?: string
  hashtags?: string[]
  reel_hook?: string
  reel_script?: string
}

/** How to generate: language, tone, optional owner instructions, and the previous version when regenerating. */
export interface GenerationOptions {
  language: LanguageCode
  tone?: Tone
  instructions?: string
  previous?: AIContentResponse
}

/** The complete, structured input every provider receives. */
export interface AIContentRequest {
  context: MarketingContext
  request: ContentRequest
  generation: GenerationOptions
}

export interface AIProvider {
  readonly id: string
  readonly model: string
  /** Returns validated, normalized output or throws AIError. */
  generateContent(request: AIContentRequest): Promise<AIContentResponse>
}

export interface AIGenerationResult {
  content: AIContentResponse
  provider: string
  model: string
}

export type AIErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'blocked'
  | 'invalid_response'
  | 'empty_response'
  | 'unknown'

/** Safe, provider-independent error. The message is for logs only, never for users. */
export class AIError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'AIError'
  }
}
