import { isPaidPlanSlug, type PaidPlanSlug } from '@/lib/config/billing'
import { hmacHex, signatureMatches } from '../signature'
import { BillingError, type BillingProvider, type CheckoutConfirmation, type CheckoutSession, type CreateSubscriptionInput } from '../types'

/**
 * Test payment provider (BILLING_PROVIDER=mock; refused in production). No network, no money.
 * It produces Razorpay-shaped events signed with BILLING_MOCK_WEBHOOK_SECRET, which go through
 * the SAME webhook processing as real ones — the database verifies them with the Vault secret
 * 'mock_webhook_secret', which exists only while automated tests run.
 */

export const mockSubscriptionId = (planSlug: PaidPlanSlug) => `mock_sub_${planSlug}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`

/** Plan encoded in a mock subscription id (mock_sub_<plan>_<random>). */
export function planFromMockSubscription(subscriptionId: string): PaidPlanSlug | null {
  const slug = /^mock_sub_([a-z]+)_[0-9a-f]{32}$/.exec(subscriptionId)?.[1]
  return slug && isPaidPlanSlug(slug) ? slug : null
}

export class MockBillingProvider implements BillingProvider {
  readonly id = 'mock' as const
  readonly cancelled: { subscriptionId: string; atCycleEnd: boolean }[] = []

  constructor(private readonly secret: string) {
    if (!secret) throw new BillingError('not_configured', 'BILLING_MOCK_WEBHOOK_SECRET is not set')
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CheckoutSession> {
    return { provider: 'mock', subscriptionId: mockSubscriptionId(input.planSlug) }
  }

  /** The mock "checkout" signs like Razorpay does, with the mock secret. */
  signCheckout(paymentId: string, subscriptionId: string): string {
    return hmacHex(`${paymentId}|${subscriptionId}`, this.secret)
  }

  verifyCheckout({ paymentId, subscriptionId, signature }: CheckoutConfirmation): boolean {
    return signatureMatches(this.signCheckout(paymentId, subscriptionId), signature)
  }

  async cancelSubscription(subscriptionId: string, options: { atCycleEnd: boolean }): Promise<void> {
    this.cancelled.push({ subscriptionId, atCycleEnd: options.atCycleEnd })
  }

  signWebhook(rawBody: string): string {
    return hmacHex(rawBody, this.secret)
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean | null {
    return signatureMatches(this.signWebhook(rawBody), signature)
  }
}

/** A Razorpay-shaped subscription event (see https://razorpay.com/docs/webhooks/subscriptions/). */
export function mockSubscriptionEvent(input: {
  event: 'subscription.activated' | 'subscription.charged' | 'subscription.pending' | 'subscription.cancelled' | 'subscription.completed'
  subscriptionId: string
  status: 'active' | 'pending' | 'cancelled' | 'completed'
  businessId: string
  ownerId: string
  planSlug: PaidPlanSlug
  periodStart: Date
  periodEnd: Date
  payment?: { id: string; amount: number; status: 'captured' | 'failed'; error?: string }
  at?: Date
}): string {
  const epoch = (d: Date) => Math.floor(d.getTime() / 1000)
  const created = epoch(input.at ?? new Date())
  return JSON.stringify({
    entity: 'event',
    event: input.event,
    contains: input.payment ? ['subscription', 'payment'] : ['subscription'],
    payload: {
      subscription: {
        entity: {
          id: input.subscriptionId,
          entity: 'subscription',
          status: input.status,
          current_start: epoch(input.periodStart),
          current_end: epoch(input.periodEnd),
          notes: { business_id: input.businessId, owner_id: input.ownerId, plan_slug: input.planSlug },
        },
      },
      ...(input.payment && {
        payment: {
          entity: {
            id: input.payment.id,
            entity: 'payment',
            amount: input.payment.amount,
            currency: 'INR',
            status: input.payment.status,
            error_description: input.payment.error ?? null,
            created_at: created,
          },
        },
      }),
    },
    created_at: created,
  })
}
