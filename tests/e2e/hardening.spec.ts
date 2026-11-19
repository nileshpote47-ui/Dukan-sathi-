import { expect, test } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, users } from './helpers'

/*
 * Phase 8: production hardening checks that run against any build — health check, search
 * engine files, security headers, forged webhooks, signed-out access and ID manipulation.
 */

test('health check answers without secrets', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  const body = await response.json()
  expect(body).toMatchObject({ status: 'ok', checks: { app: 'ok', database: 'ok' } })
  expect(JSON.stringify(body)).not.toMatch(/key|secret|token|supabase\.co/i)
})

test('security headers on pages', async ({ request }) => {
  const headers = (await request.get('/')).headers()
  expect(headers['strict-transport-security']).toContain('max-age=')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-powered-by']).toBeUndefined()
})

test('robots, sitemap, icon and landing page are launch-ready', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  for (const path of ['/dashboard', '/admin', '/onboarding', '/api/']) expect(robots).toContain(`Disallow: ${path}`)
  expect(robots).toContain('Sitemap:')
  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/pricing')
  expect(sitemap).not.toMatch(/dashboard|admin|onboarding/)
  expect((await request.get('/icon.svg')).status()).toBe(200)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/coming soon/i)).toHaveCount(0)
  expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toBe('Dukaan Sathi')
})

test('forged or unsigned webhooks and scheduler calls are refused', async ({ request }) => {
  const runner = await request.post('/api/publishing/run', { headers: { authorization: 'Bearer guessed' } })
  expect(runner.status()).toBe(401)
  expect((await request.post('/api/publishing/run')).status()).toBe(401)

  const meta = await request.post('/api/webhooks/meta', { data: { object: 'whatsapp_business_account', entry: [] }, headers: { 'x-hub-signature-256': 'sha256=00' } })
  expect([401, 503]).toContain(meta.status())

  const billing = await request.post('/api/billing/webhooks/razorpay', {
    data: { event: 'subscription.activated' },
    headers: { 'x-razorpay-signature': 'forged', 'x-razorpay-event-id': 'evt_forged_phase8' },
  })
  expect([401, 503]).toContain(billing.status())
  expect((await request.post('/api/billing/webhooks/unknown', { data: {} })).status()).toBe(404)
})

test('signed-out visitors cannot reach private pages or APIs', async ({ request }) => {
  for (const path of ['/dashboard', '/dashboard/content', '/dashboard/billing', '/dashboard/analytics', '/admin', '/onboarding', '/api/social/meta/connect']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(307)
    expect(response.headers()['location'], path).toContain('/login')
  }
})

test.describe('with test users', () => {
  test.skip(!hasTestUsers, 'Set E2E_USER_* (see tests/e2e/README.md)')
  test.describe.configure({ mode: 'serial' })
  let bItem: { id: string }
  let bUserId: string

  test.beforeAll(async () => {
    await resetBusiness(users.a, 'Hardening A Kirana', 'grocery')
    const b = await resetBusiness(users.b, 'Hardening B Mobiles', 'mobile_shop')
    const { data } = await b.client.from('content_items').insert({ business_id: b.businessId, title: 'B private offer', content_type: 'OFFER' } as never).select('id').single()
    bItem = data as { id: string }
    bUserId = b.userId
  })

  test.afterAll(async () => {
    await cleanupBusinesses(users.a, users.b)
  })

  test('malformed and foreign IDs show not found, never an error page or another owner’s data', async ({ page }) => {

    await login(page, users.a)
    for (const path of ['/dashboard/content/not-a-uuid', '/dashboard/content/00000000-0000-0000-0000-000000000000', '/dashboard/media/not-a-uuid', "/dashboard/content/1'%20or%201=1--"]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: /not found/i }).first(), path).toBeVisible()
    }
    await page.goto(`/dashboard/content/${bItem.id}`)
    await expect(page.getByRole('heading', { name: /not found/i }).first()).toBeVisible()
    await expect(page.getByText('B private offer')).toHaveCount(0)
    // A signed-in owner calling another owner's rows through the API gets nothing back.
    const a = await apiClientFor(users.a)
    expect((await a.client.from('content_items').select('id').eq('id', bItem.id)).data).toEqual([])
    const update = await a.client.from('content_items').update({ title: 'hijacked' } as never).eq('owner_id', bUserId).select('id')
    expect(update.data ?? []).toEqual([])
    const remove = await a.client.from('content_items').delete().eq('id', bItem.id).select('id')
    expect(remove.data ?? []).toEqual([])
  })
})
