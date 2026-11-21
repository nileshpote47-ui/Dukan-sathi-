import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLimitError, LIMIT_MESSAGES, planRank } from '@/lib/config/billing'
import { formatPrice, nextPeriodStartIso } from '@/lib/billing/format'
import { displayState, entitlingSubscription, isEntitling, usageLevel, type SubscriptionLike } from '@/lib/billing/state'
import { getBillingProviderId } from '@/services/billing/provider'
import { MockBillingProvider, mockSubscriptionEvent, mockSubscriptionId, planFromMockSubscription } from '@/services/billing/providers/mock'
import { RazorpayProvider } from '@/services/billing/providers/razorpay'
import { hmacHex, signatureMatches } from '@/services/billing/signature'
import { BillingError } from '@/services/billing/types'

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
const allowRequest = vi.fn(async () => true)
vi.mock('@/lib/security/rate-limit', () => ({ allowRequest: (...args: unknown[]) => allowRequest(...(args as [])) }))

afterEach(() => {
  vi.unstubAllEnvs()
  rpc.mockReset()
})

const DAY = 24 * 60 * 60 * 1000
const sub = (over: Partial<SubscriptionLike>): SubscriptionLike => ({
  status: 'ACTIVE',
  current_period_start: new Date(Date.now() - 10 * DAY).toISOString(),
  current_period_end: new Date(Date.now() + 20 * DAY).toISOString(),
  cancel_at_period_end: false,
  created_at: new Date(Date.now() - 10 * DAY).toISOString(),
  ...over,
})

// ---------------------------------------------------------------------------
describe('signatures (HMAC-SHA256, Razorpay format)', () => {
  it('matches only the exact signature, in constant time', () => {
    const sig = hmacHex('pay_1|sub_1', 'secret')
    expect(sig).toBe(createHmac('sha256', 'secret').update('pay_1|sub_1').digest('hex'))
    expect(signatureMatches(sig, sig)).toBe(true)
    expect(signatureMatches(sig, sig.toUpperCase())).toBe(true)
    expect(signatureMatches(sig, hmacHex('pay_1|sub_2', 'secret'))).toBe(false)
    expect(signatureMatches(sig, 'not-hex')).toBe(false)
    expect(signatureMatches(sig, '')).toBe(false)
    expect(signatureMatches(sig, null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('Razorpay provider (fake HTTP, no real API)', () => {
  const config = { keyId: 'rzp_test_key', keySecret: 'key_secret', webhookSecret: 'hook_secret', planIds: { starter: 'plan_S', growth: 'plan_G', premium: 'plan_P' } }
  const input = { planSlug: 'starter' as const, pricePaise: 19900, currency: 'INR', businessId: 'biz-1', ownerId: 'owner-1' }

  function fakeFetch(plan: unknown, subscription: unknown = { id: 'sub_new' }) {
    const calls: { url: string; init: RequestInit }[] = []
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init! })
      const body = url.includes('/plans/') ? plan : url.endsWith('/cancel') ? { id: 'sub_x', status: 'active' } : subscription
      return new Response(JSON.stringify(body), { status: 200 })
    }
    return { calls, fetcher }
  }

  it('verifies the plan price, then creates a subscription with our notes', async () => {
    const { calls, fetcher } = fakeFetch({ id: 'plan_S', period: 'monthly', interval: 1, item: { amount: 19900, currency: 'INR' } })
    const session = await new RazorpayProvider(config, fetcher).createSubscription(input)
    expect(session).toEqual({ provider: 'razorpay', subscriptionId: 'sub_new', keyId: 'rzp_test_key' })
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/plans/plan_S')
    expect(calls[1].url).toBe('https://api.razorpay.com/v1/subscriptions')
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('rzp_test_key:key_secret').toString('base64')}`)
    const body = JSON.parse(String(calls[1].init.body))
    expect(body).toMatchObject({ plan_id: 'plan_S', total_count: 120, quantity: 1, customer_notify: true, notes: { business_id: 'biz-1', owner_id: 'owner-1', plan_slug: 'starter' } })
    expect(body.expire_by).toBeGreaterThan(Date.now() / 1000)
    expect(JSON.stringify(body)).not.toContain('key_secret')
  })

  it('refuses a provider plan whose price or period does not match ours', async () => {
    for (const plan of [
      { period: 'monthly', interval: 1, item: { amount: 49900, currency: 'INR' } },
      { period: 'yearly', interval: 1, item: { amount: 19900, currency: 'INR' } },
      { period: 'monthly', interval: 3, item: { amount: 19900, currency: 'INR' } },
    ]) {
      const { calls, fetcher } = fakeFetch(plan)
      await expect(new RazorpayProvider(config, fetcher).createSubscription(input)).rejects.toMatchObject({ code: 'plan_mismatch' })
      expect(calls).toHaveLength(1) // no subscription created
    }
    await expect(new RazorpayProvider({ ...config, planIds: { starter: undefined, growth: 'plan_G', premium: 'plan_P' } }).createSubscription(input)).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('maps API errors safely', async () => {
    const status = (code: number) => async () => new Response('{"error":{"code":"BAD_REQUEST_ERROR"}}', { status: code })
    await expect(new RazorpayProvider(config, status(401)).createSubscription(input)).rejects.toMatchObject({ code: 'not_configured' })
    await expect(new RazorpayProvider(config, status(400)).createSubscription(input)).rejects.toMatchObject({ code: 'invalid_request' })
    await expect(new RazorpayProvider(config, status(502)).createSubscription(input)).rejects.toMatchObject({ code: 'provider_error' })
    await expect(new RazorpayProvider(config, async () => { throw new Error('ENOTFOUND') }).createSubscription(input)).rejects.toBeInstanceOf(BillingError)
  })

  it('verifies the checkout signature (payment_id|subscription_id, key secret)', () => {
    const provider = new RazorpayProvider(config)
    const signature = createHmac('sha256', 'key_secret').update('pay_1|sub_1').digest('hex')
    expect(provider.verifyCheckout({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature })).toBe(true)
    expect(provider.verifyCheckout({ paymentId: 'pay_1', subscriptionId: 'sub_OTHER', signature })).toBe(false)
    expect(provider.verifyCheckout({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature: '0'.repeat(64) })).toBe(false)
  })

  it('cancels at cycle end and verifies webhook signatures over the raw body', async () => {
    const { calls, fetcher } = fakeFetch({})
    await new RazorpayProvider(config, fetcher).cancelSubscription('sub_1', { atCycleEnd: true })
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/subscriptions/sub_1/cancel')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ cancel_at_cycle_end: true })

    const raw = '{"event":"subscription.charged"}'
    const provider = new RazorpayProvider(config)
    expect(provider.verifyWebhookSignature(raw, hmacHex(raw, 'hook_secret'))).toBe(true)
    expect(provider.verifyWebhookSignature(`${raw} `, hmacHex(raw, 'hook_secret'))).toBe(false)
    expect(new RazorpayProvider({ ...config, webhookSecret: undefined }).verifyWebhookSignature(raw, 'x')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('mock provider (tests only)', () => {
  it('creates plan-tagged subscription ids and signs like Razorpay', async () => {
    const provider = new MockBillingProvider('mock-secret')
    const session = await provider.createSubscription({ planSlug: 'growth', pricePaise: 49900, currency: 'INR', businessId: 'b', ownerId: 'o' })
    expect(session.provider).toBe('mock')
    expect(planFromMockSubscription(session.subscriptionId)).toBe('growth')
    expect(planFromMockSubscription('mock_sub_platinum_' + 'a'.repeat(32))).toBeNull()
    expect(planFromMockSubscription('sub_real')).toBeNull()
    const signature = provider.signCheckout('pay_1', session.subscriptionId)
    expect(provider.verifyCheckout({ paymentId: 'pay_1', subscriptionId: session.subscriptionId, signature })).toBe(true)
    expect(provider.verifyCheckout({ paymentId: 'pay_2', subscriptionId: session.subscriptionId, signature })).toBe(false)
    expect(() => new MockBillingProvider('')).toThrow(BillingError)
  })

  it('builds Razorpay-shaped events (subscription + optional payment entity)', () => {
    const body = JSON.parse(
      mockSubscriptionEvent({
        event: 'subscription.activated',
        subscriptionId: mockSubscriptionId('starter'),
        status: 'active',
        businessId: 'b',
        ownerId: 'o',
        planSlug: 'starter',
        periodStart: new Date('2026-11-01T00:00:00Z'),
        periodEnd: new Date('2026-12-01T00:00:00Z'),
        payment: { id: 'pay_1', amount: 19900, status: 'captured' },
      }),
    )
    expect(body.event).toBe('subscription.activated')
    expect(body.payload.subscription.entity).toMatchObject({ status: 'active', current_start: 1793491200, notes: { plan_slug: 'starter' } })
    expect(body.payload.payment.entity).toMatchObject({ id: 'pay_1', amount: 19900, currency: 'INR', status: 'captured' })
  })
})

// ---------------------------------------------------------------------------
describe('billing state rules (mirror the database)', () => {
  it('only ACTIVE gives access (until period end + 1 day); a failed renewal pauses it at once', () => {
    expect(isEntitling(sub({}))).toBe(true)
    expect(isEntitling(sub({ current_period_end: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() }))).toBe(true)
    expect(isEntitling(sub({ current_period_end: new Date(Date.now() - 2 * DAY).toISOString() }))).toBe(false) // renewal never came
    for (const status of ['PAST_DUE', 'CANCELLED', 'EXPIRED', 'PAUSED', 'AUTHENTICATED']) expect(isEntitling(sub({ status }))).toBe(false)
    expect(isEntitling(sub({ current_period_end: null }))).toBe(false)
  })

  it('picks the newest entitling subscription (upgrade) and derives the display state', () => {
    const old = sub({ current_period_start: new Date(Date.now() - 10 * DAY).toISOString() })
    const upgraded = sub({ current_period_start: new Date(Date.now() - DAY).toISOString() })
    expect(entitlingSubscription([old, upgraded])).toBe(upgraded)
    expect(displayState(upgraded, upgraded)).toBe('renewing')
    expect(displayState(sub({ cancel_at_period_end: true }), null)).toBe('cancel_at_period_end')
    expect(displayState(null, sub({ status: 'PAST_DUE' }))).toBe('past_due')
    expect(displayState(null, sub({ status: 'AUTHENTICATED' }))).toBe('activating')
    expect(displayState(null, sub({ status: 'CANCELLED', current_period_end: new Date(Date.now() - DAY).toISOString() }))).toBe('expired')
    expect(displayState(null, null)).toBe('free')
  })

  it('usage levels and plan ranks', () => {
    expect(usageLevel(30, 30, 0.2)).toBe('available')
    expect(usageLevel(6, 30, 0.2)).toBe('low')
    expect(usageLevel(0, 30, 0.2)).toBe('reached')
    expect(usageLevel(0, 0, 0.2)).toBe('reached')
    expect(planRank('free')).toBeLessThan(planRank('starter'))
    expect(planRank('starter')).toBeLessThan(planRank('growth'))
    expect(planRank('growth')).toBeLessThan(planRank('premium'))
    expect(isLimitError(LIMIT_MESSAGES.ai_text_generation)).toBe(true)
    expect(isLimitError('ai.error.failed')).toBe(false)
  })

  it('formats prices and the monthly reset date (India time)', () => {
    expect(formatPrice(19900)).toBe('₹199')
    expect(formatPrice(0)).toBe('₹0')
    expect(formatPrice(9950)).toBe('₹99.50')
    expect(nextPeriodStartIso('2026-11-01')).toBe('2026-11-30T18:30:00.000Z')
    expect(nextPeriodStartIso('2026-12-01')).toBe('2026-12-31T18:30:00.000Z')
  })
})

// ---------------------------------------------------------------------------
describe('provider configuration', () => {
  beforeEach(() => {
    for (const key of ['BILLING_PROVIDER', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'BILLING_MOCK_WEBHOOK_SECRET', 'VERCEL_ENV']) vi.stubEnv(key, '')
  })

  it('needs keys for Razorpay; the mock is refused in production', () => {
    expect(getBillingProviderId()).toBeNull()
    vi.stubEnv('BILLING_PROVIDER', 'razorpay')
    expect(getBillingProviderId()).toBeNull()
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    expect(getBillingProviderId()).toBe('razorpay')
    vi.stubEnv('BILLING_PROVIDER', 'mock')
    expect(getBillingProviderId()).toBeNull()
    vi.stubEnv('BILLING_MOCK_WEBHOOK_SECRET', 'mock')
    expect(getBillingProviderId()).toBe('mock')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(getBillingProviderId()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('usage metering (reserve → run → commit / release)', () => {
  it('a burst-limited request is refused before any usage is reserved', async () => {
    const { withUsage } = await import('@/lib/billing/usage')
    allowRequest.mockResolvedValueOnce(false)
    rpc.mockClear()
    const run = vi.fn()
    expect(await withUsage('ai_text_generation', undefined, run)).toEqual({ ok: false, error: 'errors.rateLimited' })
    expect(allowRequest).toHaveBeenCalledWith('ai_text_generation')
    expect(rpc).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('blocks at the limit without running the operation', async () => {
    const { withUsage } = await import('@/lib/billing/usage')
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'billing:limit_reached' } })
    const run = vi.fn()
    expect(await withUsage('image_generation', undefined, run)).toEqual({ ok: false, error: 'billing.limit.image_generation' })
    expect(run).not.toHaveBeenCalled()
  })

  it('commits on success and releases on failure or exception', async () => {
    const { withUsage } = await import('@/lib/billing/usage')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    rpc.mockResolvedValue({ data: 'res-1', error: null })
    expect(await withUsage('ai_text_generation', undefined, async () => ({ ok: true, data: 1 }))).toEqual({ ok: true, data: 1 })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['billing_reserve_usage', 'billing_commit_usage'])

    rpc.mockClear()
    expect(await withUsage('ai_text_generation', undefined, async () => ({ ok: false, error: 'ai.error.failed' }))).toEqual({ ok: false, error: 'ai.error.failed' })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['billing_reserve_usage', 'billing_release_usage'])

    rpc.mockClear()
    await expect(withUsage('ai_text_generation', undefined, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['billing_reserve_usage', 'billing_release_usage'])

    // Commit refused (released/stale): the result is not handed out.
    rpc.mockReset()
    rpc.mockResolvedValueOnce({ data: 'res-2', error: null }).mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'billing:usage_not_pending' } })
    expect(await withUsage('ai_text_generation', undefined, async () => ({ ok: true, data: 'secret result' }))).toEqual({ ok: false, error: 'billing.error.usage' })
  })
})

// ---------------------------------------------------------------------------
describe('webhook processing', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('BILLING_MOCK_WEBHOOK_SECRET', 'mock-secret')
  })

  it('rejects a bad signature before touching the database (when the secret is known here)', async () => {
    const { processBillingWebhook } = await import('@/services/billing/webhook')
    expect(await processBillingWebhook({ provider: 'mock', eventId: 'e1', rawBody: '{}', signature: 'bad' })).toBe('invalid_signature')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes raw body, signature and event id to the database and maps the result', async () => {
    const { processBillingWebhook, WEBHOOK_HTTP_STATUS } = await import('@/services/billing/webhook')
    const raw = '{"event":"subscription.charged"}'
    const signature = hmacHex(raw, 'mock-secret')
    for (const result of ['processed', 'duplicate', 'ignored', 'failed'] as const) {
      rpc.mockResolvedValueOnce({ data: { result }, error: null })
      expect(await processBillingWebhook({ provider: 'mock', eventId: 'e1', rawBody: raw, signature })).toBe(result)
    }
    expect(rpc).toHaveBeenLastCalledWith('billing_process_webhook', { p_provider: 'mock', p_event_id: 'e1', p_body: raw, p_signature: signature })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '500' } })
    expect(await processBillingWebhook({ provider: 'mock', eventId: 'e1', rawBody: raw, signature })).toBe('failed')
    expect(WEBHOOK_HTTP_STATUS).toMatchObject({ processed: 200, duplicate: 200, ignored: 200, invalid_signature: 401, failed: 500 })
  })

  it('cancels the superseded subscription after an upgrade is activated', async () => {
    const { processBillingWebhook } = await import('@/services/billing/webhook')
    const cancel = vi.spyOn(MockBillingProvider.prototype, 'cancelSubscription')
    const raw = '{"event":"subscription.activated"}'
    rpc.mockResolvedValueOnce({ data: { result: 'processed', cancel: ['mock_sub_old'] }, error: null })
    await processBillingWebhook({ provider: 'mock', eventId: 'e2', rawBody: raw, signature: hmacHex(raw, 'mock-secret') })
    expect(cancel).toHaveBeenCalledWith('mock_sub_old', { atCycleEnd: false })
  })
})
