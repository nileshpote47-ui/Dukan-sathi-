import type { MessageKey } from '@/lib/i18n'

/*
 * Billing (Phase 5) configuration. Lists mirrored in database check constraints must match
 * the billing migration — tests/unit/config-sync.test.ts checks this. Prices and monthly
 * limits are DATA (billing_plans / plan_entitlements), never hard-coded here or in components.
 */

/** Metered operations, mapped to the real Phase 3/4 actions and Phase 6 publishing. */
export const FEATURE_KEYS = ['ai_text_generation', 'image_generation', 'reel_generation', 'media_export', 'social_publishing'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const FEATURE_LABELS: Record<FeatureKey, MessageKey> = {
  ai_text_generation: 'billing.feature.ai_text_generation',
  image_generation: 'billing.feature.image_generation',
  reel_generation: 'billing.feature.reel_generation',
  media_export: 'billing.feature.media_export',
  social_publishing: 'billing.feature.social_publishing',
}

/** Shown when a monthly limit is reached (the server refuses the operation). */
export const LIMIT_MESSAGES: Record<FeatureKey, MessageKey> = {
  ai_text_generation: 'billing.limit.ai_text_generation',
  image_generation: 'billing.limit.image_generation',
  reel_generation: 'billing.limit.reel_generation',
  media_export: 'billing.limit.media_export',
  social_publishing: 'billing.limit.social_publishing',
}

export const SUBSCRIPTION_STATUSES = ['AUTHENTICATED', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'PAUSED'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const PAYMENT_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const LEDGER_TRANSACTION_TYPES = ['ALLOCATION', 'USAGE', 'BONUS', 'ADJUSTMENT', 'REFUND', 'EXPIRY'] as const
export const LEDGER_STATES = ['PENDING', 'COMMITTED', 'RELEASED'] as const

export const BILLING_PROVIDERS = ['razorpay', 'mock'] as const
export type BillingProviderId = (typeof BILLING_PROVIDERS)[number]

export const FREE_PLAN_SLUG = 'free'
/** Plans that can be bought, in upgrade order. */
export const PAID_PLAN_SLUGS = ['starter', 'growth'] as const
export type PaidPlanSlug = (typeof PAID_PLAN_SLUGS)[number]
export const isPaidPlanSlug = (slug: string): slug is PaidPlanSlug => (PAID_PLAN_SLUGS as readonly string[]).includes(slug)
/** Plan rank for upgrade/downgrade decisions. */
export const planRank = (slug: string) => (slug === FREE_PLAN_SLUG ? 0 : PAID_PLAN_SLUGS.indexOf(slug as PaidPlanSlug) + 1)

/** "Low usage" warning below this share of the monthly limit. */
export const LOW_USAGE_SHARE = 0.2

/** Razorpay subscriptions: cycles to bill before the subscription completes (10 years, monthly). */
export const SUBSCRIPTION_TOTAL_COUNT = 120
/** Time the owner has to complete the first payment of a new subscription. */
export const CHECKOUT_EXPIRY_SECONDS = 60 * 60
export const BILLING_API_TIMEOUT_MS = 15_000

/** True when an action error is a "monthly limit reached" message (UI shows an upgrade link). */
export const isLimitError = (key: string | null | undefined) => Boolean(key?.startsWith('billing.limit.'))
