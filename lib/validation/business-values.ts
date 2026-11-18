import type { Tables } from '@/types/database'
import type { BusinessFormInput } from './business'

/** Business row + profile → string form values (null becomes ''). */
export function toFormValues(
  business: Tables<'businesses'> | null,
  profile: Pick<Tables<'profiles'>, 'full_name' | 'preferred_language'> | null,
): BusinessFormInput {
  const s = (v: string | null | undefined) => v ?? ''
  const b: Partial<Tables<'businesses'>> = business ?? {}
  return {
    business_name: s(b.business_name),
    business_category: s(b.business_category) as BusinessFormInput['business_category'],
    ownerName: s(profile?.full_name),
    phone: s(b.phone),
    whatsapp_number: s(b.whatsapp_number),
    email: s(b.email),
    address_line: s(b.address_line),
    village: s(b.village),
    taluka: s(b.taluka),
    district: s(b.district),
    state: s(b.state),
    pincode: s(b.pincode),
    preferredLanguage: (profile?.preferred_language ?? 'en') as BusinessFormInput['preferredLanguage'],
    brand_tagline: s(b.brand_tagline),
    description: s(b.description),
    opening_hours: s(b.opening_hours),
    website_url: s(b.website_url),
    instagram_url: s(b.instagram_url),
    facebook_url: s(b.facebook_url),
    google_business_url: s(b.google_business_url),
  }
}
