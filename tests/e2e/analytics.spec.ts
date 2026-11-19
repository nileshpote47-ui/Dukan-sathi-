import { expect, test, type Page } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 7: owner analytics (real activity from the UI, mock social provider) and the admin
 * area. Admin tests need test user A to be an admin while they run (E2E_ADMIN=1); grant it
 * with SQL before and remove it afterwards — see tests/e2e/README.md.
 */
test.describe.configure({ mode: 'serial', timeout: 150_000 })
const adminTests = process.env.E2E_ADMIN === '1'
test.skip(!hasTestUsers || !process.env.PUBLISHING_SERVER_SECRET, 'Set E2E_USER_* and the publishing test env (see tests/e2e/README.md)')

let ids: { aBusiness: string; content: string }

test.beforeAll(async () => {
  const a = await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
  const { data } = await a.client
    .from('content_items')
    .insert({ business_id: a.businessId, title: 'Diwali sweets offer', content_type: 'OFFER', language: 'mr', offer_text: '10% off' } as never)
    .select('id')
    .single()
  await a.client.from('content_items').update({ status: 'READY' } as never).eq('id', data!.id)
  await a.client.from('content_items').insert({ business_id: a.businessId, title: 'Draft idea', content_type: 'POST' } as never)
  ids = { aBusiness: a.businessId, content: data!.id }
})

test.afterAll(async () => {
  await cleanupBusinesses(users.a, users.b)
})

const tile = (page: Page, label: string) => page.getByRole('group', { name: label })

test('a new business sees honest empty states, not invented numbers', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.b)
  await page.goto('/dashboard/analytics')
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible()
  await expect(tile(page, 'Content created')).toContainText('0')
  await expect(tile(page, 'Publishing success')).toContainText('—')
  await expect(tile(page, 'Publishing success')).toContainText('Nothing published or failed yet')
  await expect(page.getByText('No content was created in these dates.')).toBeVisible()
  await expect(page.getByText('You have no connected publishing channel yet.', { exact: false })).toBeVisible()
  await expect(page.getByText('No likes or comments to show yet.', { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})

test('owner analytics: real content and publishing, date filters, engagement refresh, CSV export', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)

  // Real activity: connect the (mock) Meta account and publish once to Facebook.
  await page.goto('/dashboard/accounts')
  await page.locator('div[aria-label="Facebook & Instagram"]').getByRole('link', { name: 'Connect' }).click()
  await expect(page.getByText('2 account(s) connected.')).toBeVisible()
  await page.goto(`/dashboard/content/${ids.content}/publish`)
  await page.getByRole('radio', { name: /Facebook/ }).check()
  await page.getByRole('checkbox', { name: /I checked this post/ }).check()
  await page.getByRole('button', { name: 'Publish now' }).click()
  await page.waitForURL(/\/dashboard\/publishing\?job=/)

  await page.goto('/dashboard/analytics')
  await expect(tile(page, 'Content created')).toContainText('2')
  await expect(tile(page, 'Published')).toContainText('1')
  await expect(tile(page, 'Publishing success')).toContainText('100%')
  await expect(tile(page, 'Connected channels')).toContainText('2')
  await expect(page.getByRole('region', { name: 'By type' })).toContainText('Offer')
  await expect(page.getByRole('region', { name: 'By language' })).toContainText('मराठी')
  await expect(page.getByRole('table').filter({ hasText: 'Channel' }).first()).toContainText('Facebook')
  await expect(page.getByText('You have 1 posts ready but only 0 scheduled.')).toHaveCount(0) // the ready item is published now

  // Date filters change every number.
  await page.getByRole('link', { name: 'Last month' }).click()
  await expect(tile(page, 'Content created')).toContainText('0')
  await expect(tile(page, 'Published')).toContainText('0')
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(tile(page, 'Content created')).toContainText('2')
  // Invalid custom range: clear message, safe default.
  await page.goto('/dashboard/analytics?range=CUSTOM&from=2026-11-10&to=2026-11-01')
  await expect(page.getByText('The start date must be before the end date.', { exact: false })).toBeVisible()

  // Engagement only after an explicit refresh, from the platform (mock) numbers.
  await page.goto('/dashboard/analytics')
  await expect(page.getByText('No likes or comments to show yet.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh numbers' }).click()
  await expect(page.getByText('Updated 1 post(s).')).toBeVisible()
  await expect(page.getByText('Reactions')).toBeVisible()
  await expect(page.getByText(/Last updated/)).toBeVisible()
  await page.getByRole('button', { name: 'Refresh numbers' }).click()
  await expect(page.getByText('Numbers were just updated.', { exact: false })).toBeVisible()

  // CSV export of the owner's own data.
  const csv = await page.request.get('/dashboard/analytics/export?kind=publishing&range=LAST_30_DAYS')
  expect(csv.status()).toBe(200)
  expect(csv.headers()['content-type']).toContain('text/csv')
  const text = await csv.text()
  expect(text).toContain('Diwali sweets offer')
  expect(text).toContain('FACEBOOK')
  expect(text).not.toContain('mock_token')
  expect((await page.request.get('/dashboard/analytics/export?kind=secrets')).status()).toBe(400)

  // Phone layout: no sideways scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('isolation: owner B cannot see owner A analytics, numbers, exports or the admin area', async ({ page, request }) => {
  const b = await apiClientFor(users.b)
  const { data } = await b.client.rpc('analytics_business_overview', { p_from: new Date(Date.now() - 30 * 86_400_000).toISOString(), p_to: new Date().toISOString() })
  const overview = data as { content: { created: number }; publishing: { published: number } }
  expect(overview.content.created).toBe(0)
  expect(overview.publishing.published).toBe(0)
  expect((await b.client.from('publishing_metrics').select('job_id')).data).toEqual([])
  const admin = await b.client.rpc('admin_overview', { p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date().toISOString() })
  expect(admin.error?.message).toContain('admin:forbidden')
  // Signed out: sent to the login page, no CSV.
  const anonymous = await request.get('/dashboard/analytics/export?kind=content', { maxRedirects: 0 })
  expect(anonymous.status()).toBe(307)
  expect(anonymous.headers()['location']).toContain('/login')

  await login(page, users.b)
  for (const path of ['/admin', '/admin/businesses', '/admin/system']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  }
  const csv = await page.request.get('/dashboard/analytics/export?kind=content&range=LAST_30_DAYS')
  expect(await csv.text()).not.toContain('Diwali sweets offer')
})

test('admin: overview, search, business and user details, publishing, system and audit trail', async ({ page }) => {
  test.skip(!adminTests, 'Admin tests need E2E_ADMIN=1 and a temporary admin grant for test user A')
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await page.goto('/dashboard/settings')
  await page.getByRole('link', { name: 'Admin overview' }).click()
  await expect(page.getByRole('heading', { name: 'Admin overview' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Total businesses' })).toBeVisible()

  await page.getByRole('link', { name: 'Businesses' }).click()
  await page.getByLabel('Search').fill('Shree Ganesh')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('link', { name: 'Shree Ganesh Kirana' }).click()
  await expect(page.getByRole('heading', { name: 'Shree Ganesh Kirana' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Publishing by status' })).toContainText('Published')
  await page.getByRole('link', { name: users.a.email }).click()
  await expect(page.getByRole('heading', { name: users.a.email })).toBeVisible()

  for (const [link, heading] of [['Subscriptions', 'Subscriptions'], ['Usage', 'Usage'], ['Publishing', 'Publishing']]) {
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'System' }).click()
  const audit = page.getByRole('table', { name: 'Recent admin views (audit log)' })
  await expect(audit).toContainText('ADMIN_VIEW_BUSINESS')
  await expect(audit).toContainText(ids.aBusiness)
  await expect(audit).toContainText('ADMIN_VIEW_USER')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
