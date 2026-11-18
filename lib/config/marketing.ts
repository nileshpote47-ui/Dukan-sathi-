/**
 * Marketing preference options. Mirrored by check constraints on public.businesses
 * (tests/unit/config-sync.test.ts). Labels live in lib/i18n/messages.
 */
export const TONES = ['professional', 'friendly', 'local', 'premium', 'energetic', 'traditional'] as const
export type Tone = (typeof TONES)[number]

export const PROMOTIONAL_STYLES = ['offers', 'quality', 'new_arrivals', 'festive', 'service'] as const
export type PromotionalStyle = (typeof PROMOTIONAL_STYLES)[number]

export const CONTACT_METHODS = ['whatsapp', 'phone', 'visit_store', 'website'] as const
export type ContactMethod = (typeof CONTACT_METHODS)[number]
