import { BILLING_API_TIMEOUT_MS, CHECKOUT_EXPIRY_SECONDS, SUBSCRIPTION_TOTAL_COUNT, type PaidPlanSlug } from '@/lib/config/billing'
import { hmacHex, signatureMatches } from '../signature'
import {
  BillingError,
  type BillingProvider,
  type CheckoutConfirmation,
  type CheckoutSession,
  type CreateSubscriptionInput,
} from '../types'

/**
 * Razorpay Subscriptions (https://razorpay.com/docs/payments/subscriptions/), REST API with
 * Basic auth (key id : key secret), no SDK. Everything Razorpay-specific stays in this file.
 *   POST /v1/subscriptions                 create (plan_id, total_count, customer_notify, expire_by, notes)
 *   POST /v1/subscriptions/:id/cancel      cancel_at_cycle_end true|false
 *   GET  /v1/plans/:id                     used to check the plan's amount/period before checkout
 * Checkout signature: HMAC-SHA256(razorpay_payment_id + "|" + subscription_id, key_secret).
 * Webhook signature: HMAC-SHA256(raw body, webhook secret) in X-Razorpay-Signature.
 */

const API = 'https://api.razorpay.com/v1'

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret?: string
  planIds: Record<PaidPlanSlug, string | undefined>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface RazorpayPlan {
  id: string
  period: string
  interval: number
  item?: { amount?: number; currency?: string }
}

export class RazorpayProvider implements BillingProvider {
  readonly id = 'razorpay' as const

  constructor(
    private readonly config: RazorpayConfig,
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(BILLING_API_TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch (error) {
      throw new BillingError('provider_error', 'Could not reach Razorpay', { cause: error })
    }
    const text = await response.text()
    if (!response.ok) {
      // Razorpay error bodies contain a code and description, never secrets.
      const detail = text.slice(0, 300)
      if (response.status === 401) throw new BillingError('not_configured', `Razorpay rejected the API key: ${detail}`)
      if (response.status === 400) throw new BillingError('invalid_request', `Razorpay rejected the request: ${detail}`)
      throw new BillingError('provider_error', `Razorpay error ${response.status}: ${detail}`)
    }
    return JSON.parse(text) as T
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CheckoutSession> {
    const planId = this.config.planIds[input.planSlug]
    if (!planId) throw new BillingError('not_configured', `No Razorpay plan id for ${input.planSlug}`)

    // The provider plan must charge exactly our price, monthly — otherwise refuse.
    const plan = await this.call<RazorpayPlan>('GET', `/plans/${encodeURIComponent(planId)}`)
    if (
      plan.period !== 'monthly' ||
      plan.interval !== 1 ||
      plan.item?.amount !== input.pricePaise ||
      (plan.item?.currency ?? 'INR').toUpperCase() !== input.currency
    ) {
      throw new BillingError('plan_mismatch', `Razorpay plan ${planId} does not match ${input.planSlug} (${input.pricePaise} ${input.currency} monthly)`)
    }

    const subscription = await this.call<{ id: string }>('POST', '/subscriptions', {
      plan_id: planId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      quantity: 1,
      customer_notify: true,
      expire_by: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_SECONDS,
      // Signed back to us in every webhook: the business and plan this subscription is for.
      notes: { business_id: input.businessId, owner_id: input.ownerId, plan_slug: input.planSlug },
    })
    return { provider: 'razorpay', subscriptionId: subscription.id, keyId: this.config.keyId }
  }

  verifyCheckout({ paymentId, subscriptionId, signature }: CheckoutConfirmation): boolean {
    return signatureMatches(hmacHex(`${paymentId}|${subscriptionId}`, this.config.keySecret), signature)
  }

  async cancelSubscription(subscriptionId: string, { atCycleEnd }: { atCycleEnd: boolean }): Promise<void> {
    await this.call('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: atCycleEnd })
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean | null {
    if (!this.config.webhookSecret) return null
    return signatureMatches(hmacHex(rawBody, this.config.webhookSecret), signature)
  }
}
