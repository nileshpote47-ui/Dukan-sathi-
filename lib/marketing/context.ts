import { isContentType } from '@/lib/config/content'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/config/languages'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES, type ContactMethod, type PromotionalStyle, type Tone } from '@/lib/config/marketing'
import { formatLocation } from '@/lib/utils/business'
import type { MarketingContext, MarketingGenerationRequest } from '@/services/ai/types'
import type { Tables } from '@/types/database'

/*
 * Pure functions that turn stored data into the structured input for the future
 * AI engine (Phase 3). No network calls. Empty values are left out so a provider
 * never receives blank strings.
 */

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const oneOf = <T extends string>(values: readonly T[], value: string | null | undefined): T | undefined =>
  value && (values as readonly string[]).includes(value) ? (value as T) : undefined

const language = (...candidates: (string | null | undefined)[]): LanguageCode =>
  (candidates.find((c) => c && isLanguageCode(c)) as LanguageCode | undefined) ?? DEFAULT_LANGUAGE

export function buildMarketingContext(
  business: Tables<'businesses'>,
  profile: Pick<Tables<'profiles'>, 'preferred_language'> | null,
): MarketingContext {
  return {
    business: {
      name: business.business_name,
      category: business.business_category,
      location: clean(formatLocation(business)),
      description: clean(business.description),
      tagline: clean(business.brand_tagline),
      targetCustomers: clean(business.target_customers),
      phone: clean(business.phone),
      whatsapp: clean(business.whatsapp_number),
      openingHours: clean(business.opening_hours),
    },
    preferences: {
      // Business content language first, then the owner's app language.
      language: language(business.content_language, profile?.preferred_language),
      tone: oneOf<Tone>(TONES, business.tone),
      callToAction: clean(business.preferred_cta),
      promotionalStyle: oneOf<PromotionalStyle>(PROMOTIONAL_STYLES, business.promotional_style),
      contactMethod: oneOf<ContactMethod>(CONTACT_METHODS, business.preferred_contact_method),
    },
  }
}

export function buildGenerationRequest(
  context: MarketingContext,
  item: Tables<'content_items'>,
  template?: Pick<Tables<'content_templates'>, 'slug' | 'name' | 'content_type' | 'default_cta'> | null,
): MarketingGenerationRequest {
  if (!isContentType(item.content_type)) throw new Error(`Unknown content type: ${item.content_type}`)
  return {
    context,
    request: {
      contentItemId: item.id,
      type: item.content_type,
      title: item.title,
      language: language(item.language, context.preferences.language),
      product: clean(item.product_name),
      offer: clean(item.offer_text),
      price: clean(item.price),
      description: clean(item.description),
      notes: clean(item.notes),
      // Most specific call to action wins: content item, then template, then business default.
      callToAction: clean(item.call_to_action) ?? clean(template?.default_cta) ?? context.preferences.callToAction,
      template:
        template && isContentType(template.content_type)
          ? { slug: template.slug, name: template.name, contentType: template.content_type }
          : undefined,
    },
  }
}
