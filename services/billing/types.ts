/**
 * Payment provider boundary (Phase 5). Billing code depends only on these types; provider
 * APIs live in services/billing/providers/* and never reach pages or components.
 * Payment and subscription STATE never comes from these calls: it changes only through
 * signed webhooks processed in the database (billing_process_webhook).
 */
import type { BillingProviderId, PaidPlanSlug } from '@/lib/config/billing'

export interface CreateSubscriptionInput {
  planSlug: PaidPlanSlug
  /** Authoritative price from billing_plans (server-side), used to verify the provider plan. */
  pricePaise: number
  currency: string
  businessId: string
  ownerId: string
}

/** What the browser needs to open the provider's checkout. Contains no secrets. */
export interface CheckoutSession {
  provider: BillingProviderId
  subscriptionId: string
  /** Public key id for Razorpay Checkout (not a secret). */
  keyId?: string
}

export interface CheckoutConfirmation {
  paymentId: string
  subscriptionId: string
  signature: string
}

export interface BillingProvider {
  readonly id: BillingProviderId
  /** Create a subscription for the plan (owner pays in the provider's checkout). */
  createSubscription(input: CreateSubscriptionInput): Promise<CheckoutSession>
  /** Verify the checkout signature server-side (never trust the browser's "success"). */
  verifyCheckout(confirmation: CheckoutConfirmation): boolean
  /** Cancel now or at the end of the current billing cycle. */
  cancelSubscription(subscriptionId: string, options: { atCycleEnd: boolean }): Promise<void>
  /** Optional fast check of a webhook signature before the database verifies it again. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean | null
}

export type BillingErrorCode = 'not_configured' | 'plan_mismatch' | 'provider_error' | 'invalid_request'

export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'BillingError'
  }
}
