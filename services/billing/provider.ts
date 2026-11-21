import 'server-only'
import { BILLING_PROVIDERS, type BillingProviderId } from '@/lib/config/billing'
import { MockBillingProvider } from './providers/mock'
import { RazorpayProvider } from './providers/razorpay'
import { BillingError, type BillingProvider } from './types'

/*
 * Chooses the payment provider from server-only environment variables:
 *   BILLING_PROVIDER = razorpay | mock
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (secret), RAZORPAY_WEBHOOK_SECRET (secret)
 *   RAZORPAY_PLAN_STARTER, RAZORPAY_PLAN_GROWTH, RAZORPAY_PLAN_PREMIUM (provider plan ids; amounts are verified)
 *   BILLING_MOCK_WEBHOOK_SECRET (tests only)
 * Secrets are never sent to the browser or logged.
 */

/** Env values trimmed: a pasted key with a stray space or newline would fail authentication. */
const env = (name: string) => process.env[name]?.trim() || undefined

export function getBillingProviderId(): BillingProviderId | null {
  const id = process.env.BILLING_PROVIDER?.trim().toLowerCase()
  if (!id || !(BILLING_PROVIDERS as readonly string[]).includes(id)) return null
  if (id === 'razorpay') return env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET') ? 'razorpay' : null
  // The test provider must never serve real users.
  if (process.env.VERCEL_ENV === 'production') return null
  return process.env.BILLING_MOCK_WEBHOOK_SECRET ? 'mock' : null
}

export const isBillingConfigured = () => getBillingProviderId() !== null

/** A provider by id (also used for existing subscriptions, which remember their provider). */
export function getBillingProvider(id: BillingProviderId | null = getBillingProviderId()): BillingProvider {
  const keyId = env('RAZORPAY_KEY_ID')
  const keySecret = env('RAZORPAY_KEY_SECRET')
  if (id === 'razorpay' && keyId && keySecret) {
    return new RazorpayProvider({
      keyId,
      keySecret,
      webhookSecret: env('RAZORPAY_WEBHOOK_SECRET'),
      planIds: { starter: env('RAZORPAY_PLAN_STARTER'), growth: env('RAZORPAY_PLAN_GROWTH'), premium: env('RAZORPAY_PLAN_PREMIUM') },
    })
  }
  if (id === 'mock' && process.env.VERCEL_ENV !== 'production' && process.env.BILLING_MOCK_WEBHOOK_SECRET) {
    return new MockBillingProvider(process.env.BILLING_MOCK_WEBHOOK_SECRET)
  }
  throw new BillingError('not_configured', 'Billing provider not configured')
}
