import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/lib/config/media'
import { missingOwnerFacts } from '@/lib/content/owner-facts'
import { BASIC_LAYOUT_SLUG, isPosterLayoutSlug } from '@/lib/config/poster-templates'
import type { PosterTexts } from '@/lib/media/poster-layout'
import { posterSpecSchema } from '@/lib/validation/media'
import type { AIContentResponse } from '@/services/ai/types'
import type { Tables } from '@/types/database'

/*
 * Starting point for a poster, built only from the owner's own data: the saved AI copy
 * (Phase 3), the content request and the business profile. Nothing is invented — a
 * badge appears only when the owner entered a short offer or price, and the owner's product,
 * offer and price are always on the poster word for word.
 */

type Item = Pick<Tables<'content_items'>, 'title' | 'content_type' | 'product_name' | 'price' | 'offer_text' | 'description' | 'call_to_action'> & {
  template: { slug: string } | null
}
type Business = Pick<Tables<'businesses'>, 'business_name' | 'village' | 'taluka' | 'district' | 'phone' | 'whatsapp_number' | 'preferred_cta'>

const TYPE_LAYOUTS: Record<string, string> = {
  OFFER: 'special-offer',
  FESTIVAL: 'festival-offer',
  POSTER: 'customer-attraction',
}

const cut = (value: string | null | undefined, max: number) => {
  const text = value?.trim() ?? ''
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

export function posterDefaults(item: Item, copy: AIContentResponse | null, business: Business): {
  template: string
  aspectRatio: AspectRatio
  texts: PosterTexts
} {
  const template =
    item.template && isPosterLayoutSlug(item.template.slug) ? item.template.slug : (TYPE_LAYOUTS[item.content_type] ?? BASIC_LAYOUT_SLUG)
  // Badge: the owner's price if it is short, otherwise a short offer.
  const badge = [item.price, item.offer_text].map((v) => v?.trim()).find((v) => v && v.length <= 40) ?? ''
  const headline = cut(copy?.headline || copy?.reel_hook || item.title, 120)
  // The owner's product, offer and price always reach the poster exactly as typed: any that the
  // headline, AI text and badge do not already show go first in the body, so they are never cut off.
  const aiBody = copy?.primary_text || copy?.short_text || item.description || ''
  const facts = missingOwnerFacts(item, [headline, aiBody, badge].join('\n')).map((fact) => fact.value).join('\n')
  const body = facts ? cut([facts, aiBody.trim()].filter(Boolean).join('\n'), 400) : cut(aiBody, 400)
  const place = business.village || business.taluka || business.district
  const phone = business.whatsapp_number || business.phone
  return {
    template,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    texts: {
      headline,
      body,
      badge,
      cta: cut(copy?.call_to_action || item.call_to_action || business.preferred_cta, 80),
      businessName: cut(business.business_name, 100),
      footer: cut([place, phone].filter(Boolean).join(' · '), 120),
    },
  }
}

/** Re-open a saved poster's settings (for "make another version"). */
export function posterFromMetadata(metadata: unknown): { template: string; aspectRatio: AspectRatio; texts: PosterTexts; imageId: string | null } | null {
  const parsed = posterSpecSchema.omit({ content_id: true }).safeParse(metadata)
  if (!parsed.success) return null
  return { template: parsed.data.template, aspectRatio: parsed.data.aspect_ratio, texts: parsed.data.texts, imageId: parsed.data.image_asset_id }
}
