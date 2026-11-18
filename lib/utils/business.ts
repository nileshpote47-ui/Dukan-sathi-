import type { Tables } from '@/types/database'

type Business = Tables<'businesses'>

/**
 * Fields that make a business profile "complete". Weighted equally.
 * Social links count once if any of them is present.
 */
const COMPLETION_CHECKS: ((b: Business) => boolean)[] = [
  (b) => Boolean(b.business_name),
  (b) => Boolean(b.business_category),
  (b) => Boolean(b.phone),
  (b) => Boolean(b.whatsapp_number),
  (b) => Boolean(b.address_line),
  (b) => Boolean(b.village && b.district && b.state),
  (b) => Boolean(b.pincode),
  (b) => Boolean(b.description),
  (b) => Boolean(b.brand_tagline),
  (b) => Boolean(b.opening_hours),
  (b) => Boolean(b.website_url || b.instagram_url || b.facebook_url || b.google_business_url),
]

export function profileCompletion(business: Business): number {
  const done = COMPLETION_CHECKS.filter((check) => check(business)).length
  return Math.round((done / COMPLETION_CHECKS.length) * 100)
}

/** "Shirur, Shirur Taluka, Pune, Maharashtra 412210" — skips empty parts. */
export function formatLocation(b: Pick<Business, 'village' | 'taluka' | 'district' | 'state' | 'pincode'>): string {
  const place = [b.village, b.taluka, b.district, b.state].filter(Boolean).join(', ')
  return [place, b.pincode].filter(Boolean).join(' ')
}
