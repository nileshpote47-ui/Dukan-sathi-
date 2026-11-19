import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/lib/config/media'
import { BASIC_LAYOUT_SLUG, isPosterLayoutSlug } from '@/lib/config/poster-templates'
import type { PosterTexts } from '@/lib/media/poster-layout'
import { posterSpecSchema } from '@/lib/validation/media'
import type { AIContentResponse } from '@/services/ai/types'
import type { Tables } from '@/types/database'

/*
 * Starting point for a poster, built only from the owner's own data: the saved AI copy
 * (Phase 3), the content request and the business profile. Nothing is invented — a
 * badge appears only when the owner entered a price or a short offer.
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
  const shortOffer = [item.price, item.offer_text].map((v) => v?.trim()).find((v) => v && v.length <= 40)
  const place = business.village || business.taluka || business.district
  const phone = business.whatsapp_number || business.phone
  return {
    template,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    texts: {
      headline: cut(copy?.headline || copy?.reel_hook || item.title, 120),
      body: cut(copy?.primary_text || copy?.short_text || item.description, 400),
      badge: shortOffer ?? '',
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
