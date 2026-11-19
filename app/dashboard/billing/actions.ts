'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOnboardedBusiness, requireUser } from '@/lib/auth/dal'
import { isPaidPlanSlug, planRank, type PaidPlanSlug } from '@/lib/config/billing'
import { getBillingOverview } from '@/lib/data/billing'
import type { MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/validation/result'
import { getBillingProvider, getBillingProviderId } from '@/services/billing/provider'
import { MockBillingProvider, mockSubscriptionEvent, planFromMockSubscription } from '@/services/billing/providers/mock'
import { BillingError, type CheckoutSession } from '@/services/billing/types'
import { processBillingWebhook } from '@/services/billing/webhook'

/*
 * Billing Server Actions. The client may only name a plan; price, currency, plan limits and
 * the business always come from the server. Payment success is never taken from the browser:
 * the checkout signature is verified here, and the plan is activated only by the provider's
 * signed webhook (processed in the database).
 */

const BILLING_ERRORS: Record<BillingError['code'], MessageKey> = {
  not_configured: 'billing.error.notConfigured',
  plan_mismatch: 'billing.error.notConfigured',
  provider_error: 'billing.error.provider',
  invalid_request: 'billing.error.provider',
}

function billingFailure(error: unknown, what: string): { ok: false; error: MessageKey } {
  if (error instanceof BillingError) {
    console.error(`[billing] ${what}`, { code: error.code, message: error.message.slice(0, 300) })
    return { ok: false, error: BILLING_ERRORS[error.code] }
  }
  console.error(`[billing] ${what}`, error instanceof Error ? error.message.slice(0, 300) : 'unknown')
  return { ok: false, error: 'billing.error.provider' }
}

export type StartCheckoutResult = CheckoutSession & { planName: string; prefill: { email?: string; contact?: string } }

/** Create a provider subscription for a paid plan and return what the checkout needs. */
export async function startCheckout(planSlug: unknown): Promise<ActionResult<StartCheckoutResult>> {
  const { business, profile } = await requireOnboardedBusiness()
  const user = await requireUser()
  if (typeof planSlug !== 'string' || !isPaidPlanSlug(planSlug)) return { ok: false, error: 'errors.validation' }
  if (!getBillingProviderId()) return { ok: false, error: 'billing.error.notConfigured' }

  const overview = await getBillingOverview()
  const plan = overview.plans.find((p) => p.slug === planSlug)
  if (!plan) return { ok: false, error: 'errors.validation' }
  // Only upgrades (or a first paid plan). Downgrades: cancel, then choose after the period ends.
  if (overview.current && planRank(overview.currentPlan.slug) >= planRank(plan.slug)) {
    return { ok: false, error: overview.currentPlan.slug === plan.slug ? 'billing.error.alreadyOnPlan' : 'billing.error.downgrade' }
  }

  try {
    const session = await getBillingProvider().createSubscription({
      planSlug: plan.slug as PaidPlanSlug,
      pricePaise: plan.price_paise, // authoritative price, from the database
      currency: plan.currency,
      businessId: business.id,
      ownerId: user.id,
    })
    console.info('[billing] checkout started', { provider: session.provider, plan: plan.slug })
    return {
      ok: true,
      data: {
        ...session,
        planName: plan.name,
        prefill: { email: user.email ?? undefined, contact: business.phone ?? profile?.phone ?? undefined },
      },
    }
  } catch (error) {
    return billingFailure(error, 'checkout failed')
  }
}

const confirmationSchema = z.object({
  paymentId: z.string().min(1).max(100),
  subscriptionId: z.string().min(1).max(100),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
})

/**
 * Verify the checkout result server-side. A valid signature proves the payment came from the
 * provider; the plan itself is activated by the provider's webhook (we only report progress).
 */
export async function confirmCheckout(input: unknown): Promise<ActionResult<{ verified: true }>> {
  await requireOnboardedBusiness()
  const parsed = confirmationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'billing.error.verification' }
  const providerId = parsed.data.subscriptionId.startsWith('mock_sub_') ? 'mock' : getBillingProviderId()
  try {
    if (!getBillingProvider(providerId).verifyCheckout(parsed.data)) {
      console.warn('[billing] checkout signature mismatch')
      return { ok: false, error: 'billing.error.verification' }
    }
  } catch (error) {
    return billingFailure(error, 'verify failed')
  }
  revalidatePath('/dashboard/billing')
  return { ok: true, data: { verified: true }, message: 'billing.paymentVerified' }
}

/** Cancel the current paid plan at the end of the billing period. */
export async function cancelSubscription(): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const overview = await getBillingOverview()
  const sub = overview.current
  if (!sub || sub.cancel_at_period_end) return { ok: false, error: 'billing.error.nothingToCancel' }
  try {
    await getBillingProvider(sub.provider as 'razorpay' | 'mock').cancelSubscription(sub.provider_subscription_id, { atCycleEnd: true })
  } catch (error) {
    return billingFailure(error, 'cancel failed')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('billing_mark_cancel_requested', { p_subscription_id: sub.id })
  if (error) console.error('[billing] mark cancel failed', { code: error.code })
  revalidatePath('/dashboard/billing')
  return { ok: true, message: 'billing.cancelRequested' }
}

const mockSchema = z.object({ subscriptionId: z.string().max(100), outcome: z.enum(['success', 'failure']) })

/**
 * TEST PROVIDER ONLY (BILLING_PROVIDER=mock, never in production): plays the role of the
 * provider's checkout. On success it sends a signed activation webhook through the normal
 * processing path and returns a checkout signature, exactly like Razorpay Checkout would.
 */
export async function completeMockCheckout(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; subscriptionId: string; signature: string }>> {
  const { business } = await requireOnboardedBusiness()
  const user = await requireUser()
  if (getBillingProviderId() !== 'mock') return { ok: false, error: 'billing.error.notConfigured' }
  const parsed = mockSchema.safeParse(input)
  const planSlug = parsed.success ? planFromMockSubscription(parsed.data.subscriptionId) : null
  if (!parsed.success || !planSlug) return { ok: false, error: 'errors.validation' }
  if (parsed.data.outcome === 'failure') return { ok: false, error: 'billing.paymentFailed' }

  const provider = getBillingProvider('mock') as MockBillingProvider
  const plan = (await getBillingOverview()).plans.find((p) => p.slug === planSlug)!
  const paymentId = `mock_pay_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
  const now = new Date()
  const end = new Date(now)
  end.setMonth(end.getMonth() + 1)
  const body = mockSubscriptionEvent({
    event: 'subscription.activated',
    subscriptionId: parsed.data.subscriptionId,
    status: 'active',
    businessId: business.id,
    ownerId: user.id,
    planSlug,
    periodStart: now,
    periodEnd: end,
    payment: { id: paymentId, amount: plan.price_paise, status: 'captured' },
  })
  const eventId = `mock_evt_${globalThis.crypto.randomUUID()}`
  const outcome = await processBillingWebhook({ provider: 'mock', eventId, rawBody: body, signature: provider.signWebhook(body) })
  if (outcome !== 'processed') return { ok: false, error: 'billing.error.provider' }
  return { ok: true, data: { paymentId, subscriptionId: parsed.data.subscriptionId, signature: provider.signCheckout(paymentId, parsed.data.subscriptionId) } }
}
