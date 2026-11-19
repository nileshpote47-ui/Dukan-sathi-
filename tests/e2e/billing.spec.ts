import { createHmac } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 5 journeys with the MOCK payment provider (app started with BILLING_PROVIDER=mock and
 * BILLING_MOCK_WEBHOOK_SECRET; the same secret stored in Vault as 'mock_webhook_secret' while
 * the tests run — see tests/e2e/README.md). No real payments.
 */
test.describe.configure({ mode: 'serial' })
const mockSecret = process.env.BILLING_MOCK_WEBHOOK_SECRET ?? ''
test.skip(!hasTestUsers || !mockSecret, 'Set E2E_USER_* and BILLING_MOCK_WEBHOOK_SECRET (see tests/e2e/README.md)')

let ids: { aBusiness: string; aContent: string; aUser: string }

test.beforeAll(async () => {
  const a = await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
  const { data } = await a.client
    .from('content_items')
    .insert({ business_id: a.businessId, title: 'Rice poster', content_type: 'POST', product_name: 'Basmati rice' } as never)
    .select('id')
    .single()
  ids = { aBusiness: a.businessId, aContent: data!.id, aUser: a.userId }
})

test.afterAll(async () => {
  for (const user of [users.a, users.b]) {
    const { client, userId } = await apiClientFor(user)
    const { data } = await client.storage.from('business-media').list(userId)
    if (data?.length) await client.storage.from('business-media').remove(data.map((f) => `${userId}/${f.name}`))
  }
  await cleanupBusinesses(users.a, users.b)
})

/** Send a webhook exactly as the provider would (raw body + HMAC header + event id). */
async function sendWebhook(page: Page, provider: 'mock' | 'razorpay', body: string, opts: { eventId?: string; signature?: string } = {}) {
  return page.request.post(`/api/billing/webhooks/${provider}`, {
    data: Buffer.from(body, 'utf8'), // raw bytes: Playwright would re-encode an invalid JSON string
    headers: {
      'content-type': 'application/json',
      'x-razorpay-event-id': opts.eventId ?? `evt_${crypto.randomUUID()}`,
      'x-razorpay-signature': opts.signature ?? createHmac('sha256', mockSecret).update(body).digest('hex'),
    },
  })
}

function subscriptionEvent(event: string, subId: string, status: string, start: Date, end: Date, at: Date, payment?: { id: string; amount: number }) {
  const epoch = (d: Date) => Math.floor(d.getTime() / 1000)
  return JSON.stringify({
    entity: 'event',
    event,
    payload: {
      subscription: { entity: { id: subId, status, current_start: epoch(start), current_end: epoch(end), notes: { business_id: ids.aBusiness, plan_slug: 'starter' } } },
      ...(payment && { payment: { entity: { id: payment.id, amount: payment.amount, currency: 'INR', status: 'captured', created_at: epoch(at) } } }),
    },
    created_at: epoch(at),
  })
}

async function billingRows(user = users.a) {
  const { client } = await apiClientFor(user)
  const [subs, payments] = await Promise.all([
    client.from('business_subscriptions').select('provider_subscription_id, status, current_period_end, cancel_at_period_end, plan_id').eq('business_id', ids.aBusiness),
    // Payment history outlives a deleted business (audit), so look at this run's business only.
    client.from('billing_payments').select('provider_payment_id, status, amount_paise').eq('business_id', ids.aBusiness),
  ])
  return { subs: subs.data ?? [], payments: payments.data ?? [] }
}

test('public pricing page lists the plans from the database', async ({ page }) => {
  await page.goto('/pricing')
  for (const name of ['Free', 'Starter', 'Growth']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('₹199')).toBeVisible()
  await expect(page.getByText('₹499')).toBeVisible()
  await expect(page.getByText('Introductory price — not final yet.').first()).toBeVisible()
  await expect(page.getByText('30 AI content generations a month')).toBeVisible()
})

test('free user: sees the Free plan, uses AI pictures until the limit, gets the limit message', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await expect(page.getByRole('heading', { name: 'Your plan: Free' })).toBeVisible()

  await page.goto(`/dashboard/content/${ids.aContent}/poster`)
  const generate = page.getByRole('button', { name: 'Create picture with AI' })
  for (let i = 1; i <= 3; i++) {
    await generate.click()
    await expect(page.getByRole('radio', { name: `Picture ${i}` })).toBeVisible({ timeout: 15_000 })
    await expect(generate).toBeEnabled()
  }
  await generate.click()
  const alert = page.getByRole('alert').filter({ hasText: 'You have reached your monthly AI picture limit.' })
  await expect(alert).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Picture 4' })).toHaveCount(0) // nothing generated

  await alert.getByRole('link', { name: 'View plans' }).click()
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  const pictures = page.getByRole('listitem', { name: 'AI pictures' })
  await expect(pictures).toContainText('3 of 3 used')
  await expect(pictures).toContainText('Limit reached')
  await expect(page.getByRole('listitem', { name: 'AI content' })).toContainText('0 of 30 used')
  expect(errors).toEqual([])
})

test('failed test payment changes nothing', async ({ page }) => {
  await login(page, users.a)
  await page.goto('/dashboard/billing')
  await page.getByRole('button', { name: 'Choose Starter' }).click()
  const dialog = page.getByRole('dialog', { name: 'Test payment (no real money)' })
  await dialog.getByRole('button', { name: 'Simulate failed payment' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Payment failed.' })).toBeVisible()
  const rows = await billingRows()
  expect(rows.subs).toHaveLength(0)
  expect(rows.payments).toHaveLength(0)
})

test('paid user: checkout → verified → webhook → Starter active, payment recorded, higher limits', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await page.goto('/dashboard/billing')
  await page.getByRole('button', { name: 'Choose Starter' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pay ₹199 (test)' }).click()
  await page.waitForURL(/\/dashboard\/billing\?activating=starter/)
  await expect(page.getByRole('status').filter({ hasText: 'Subscription active: Starter.' })).toBeVisible({ timeout: 30_000 })

  const plan = page.getByRole('heading', { name: 'Current plan' }).locator('..')
  await expect(plan).toContainText('Starter')
  await expect(page.getByText('Subscription active · renews automatically')).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'AI pictures' })).toContainText('3 of 20 used') // allowance topped up
  await expect(page.getByRole('list').filter({ hasText: 'mock_pay_' })).toContainText('Paid')
  await expect(page.getByRole('button', { name: 'Upgrade to Growth' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose Starter' })).toHaveCount(0)

  const rows = await billingRows()
  expect(rows.subs).toHaveLength(1)
  expect(rows.subs[0]).toMatchObject({ status: 'ACTIVE', cancel_at_period_end: false })
  expect(rows.payments).toEqual([expect.objectContaining({ status: 'CAPTURED', amount_paise: 19900 })])

  // Entitlements apply immediately: a 4th AI picture is now allowed.
  await page.goto(`/dashboard/content/${ids.aContent}/poster`)
  await page.getByRole('button', { name: 'Create picture with AI' }).click()
  await expect(page.getByRole('radio', { name: 'Picture 4' })).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})

test('webhooks: forged rejected, duplicates ignored, renewal extends, cancellation and expiry handled', async ({ page }) => {
  const sub = (await billingRows()).subs[0]
  const subId = sub.provider_subscription_id
  const now = new Date()

  // Forged or unsigned events are rejected and change nothing.
  const forged = subscriptionEvent('subscription.cancelled', subId, 'cancelled', now, now, now)
  expect((await sendWebhook(page, 'mock', forged, { signature: '0'.repeat(64) })).status()).toBe(401)
  expect((await sendWebhook(page, 'razorpay', forged, { signature: '0'.repeat(64) })).status()).not.toBe(200)
  expect((await sendWebhook(page, 'mock', '{not json', { signature: createHmac('sha256', mockSecret).update('{not json').digest('hex') })).status()).toBe(400)
  expect((await billingRows()).subs[0].status).toBe('ACTIVE')

  // Renewal (subscription.charged), delivered twice: one payment, period extended.
  const nextStart = new Date(sub.current_period_end!)
  const nextEnd = new Date(nextStart.getTime() + 30 * 24 * 60 * 60 * 1000)
  const renewal = subscriptionEvent('subscription.charged', subId, 'active', nextStart, nextEnd, new Date(now.getTime() + 1000), { id: 'pay_renewal_1', amount: 19900 })
  const eventId = `evt_${crypto.randomUUID()}`
  expect((await sendWebhook(page, 'mock', renewal, { eventId })).status()).toBe(200)
  expect((await sendWebhook(page, 'mock', renewal, { eventId })).status()).toBe(200) // duplicate delivery
  let rows = await billingRows()
  expect(rows.payments.filter((p) => p.provider_payment_id === 'pay_renewal_1')).toHaveLength(1)
  expect(new Date(rows.subs[0].current_period_end!).getTime()).toBe(Math.floor(nextEnd.getTime() / 1000) * 1000)

  // Owner cancels at period end: stays active until then.
  await login(page, users.a)
  await page.goto('/dashboard/billing')
  await page.getByRole('button', { name: 'Cancel subscription' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel at period end' }).click()
  await expect(page.getByText('Subscription cancelled · active until the period ends')).toBeVisible()
  rows = await billingRows()
  expect(rows.subs[0]).toMatchObject({ status: 'ACTIVE', cancel_at_period_end: true })

  // Failed renewal (halted): paid access pauses at once, back to Free limits.
  const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const halted = subscriptionEvent('subscription.halted', subId, 'halted', new Date(past.getTime() - 30 * 24 * 60 * 60 * 1000), past, new Date(now.getTime() + 2000))
  expect((await sendWebhook(page, 'mock', halted)).status()).toBe(200)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Current plan' }).locator('..')).toContainText('Free')
  await expect(page.getByText('Payment failed', { exact: true })).toBeVisible()
})

test('security: other owners cannot read or change billing; client cannot write billing state', async ({ page }) => {
  const b = await apiClientFor(users.b)
  const subs = await b.client.from('business_subscriptions').select('id')
  const payments = await b.client.from('billing_payments').select('id')
  const usage = await b.client.from('usage_ledger').select('id').eq('owner_id', ids.aUser)
  expect(subs.data).toEqual([])
  expect(payments.data).toEqual([])
  expect(usage.data).toEqual([])

  const a = await apiClientFor(users.a)
  const { data: aSubs } = await a.client.from('business_subscriptions').select('id')
  const cancelOther = await b.client.rpc('billing_mark_cancel_requested', { p_subscription_id: aSubs![0].id })
  expect(cancelOther.error).not.toBeNull()

  // Owners cannot grant themselves anything directly.
  expect((await a.client.from('billing_payments').insert({ provider: 'mock', provider_payment_id: 'x', amount_paise: 1, currency: 'INR', status: 'CAPTURED' } as never)).error).not.toBeNull()
  expect((await a.client.from('business_subscriptions').update({ status: 'ACTIVE' } as never).eq('id', aSubs![0].id).select('id')).data ?? []).toEqual([])
  expect((await a.client.from('billing_plans').update({ price_paise: 1 } as never).eq('slug', 'growth').select('id')).data ?? []).toEqual([])
  expect((await a.client.from('usage_ledger').insert({ business_id: ids.aBusiness, owner_id: ids.aUser, feature_key: 'image_generation', period_start: '2026-11-01', amount: 1000, transaction_type: 'BONUS' } as never)).error).not.toBeNull()

  // B's pages show B's own (free) state.
  await login(page, users.b)
  await page.goto('/dashboard/billing')
  await expect(page.getByRole('heading', { name: 'Current plan' }).locator('..')).toContainText('Free')
  await expect(page.getByText('No payments yet.')).toBeVisible()
})
