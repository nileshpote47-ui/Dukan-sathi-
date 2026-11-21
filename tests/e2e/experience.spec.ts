import { expect, test } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * UX refresh, stage 1: the dashboard composer (one sentence → draft + AI copy, mock AI),
 * "Write with AI" on the content page, grouped navigation and the attention bell.
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 })
test.skip(!hasTestUsers, 'Set E2E_USER_* (see tests/e2e/README.md)')

test.beforeAll(async () => {
  await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
})
test.afterAll(async () => {
  await cleanupBusinesses(users.a)
})

test('dashboard composer: example sentence → Marathi offer with AI copy, owner words kept', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await expect(page.getByRole('heading', { name: 'What do you want to sell today?', level: 1 })).toBeVisible()
  await expect(page.getByText(/AI posts left this month/)).toBeVisible()

  const make = page.getByRole('button', { name: 'Make it' })
  await expect(make).toBeDisabled() // nothing written yet
  await page.getByRole('button', { name: 'Diwali offer' }).click()
  await expect(page.getByLabel('In your own words')).toHaveValue('20% off all dry fruits for Diwali, cashews ₹899/kg')
  await expect(page.getByRole('button', { name: /Offer/ }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /मराठी/ }).click()
  await make.click()

  await page.waitForURL(/\/dashboard\/content\/[0-9a-f-]{36}\?created=1/)
  await expect(page.getByRole('status')).toContainText('Your post is ready')
  await expect(page.getByRole('heading', { name: '20% off all dry fruits for Diwali', level: 1 })).toBeVisible()
  await expect(page.getByText('20% off all dry fruits for Diwali, cashews ₹899/kg')).toBeVisible() // description, as typed
  await expect(page.getByText('मराठी').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('content page: Write with AI fills copy in place, without going through Edit', async ({ page }) => {
  const a = await apiClientFor(users.a)
  const { data: business } = await a.client.from('businesses').select('id').eq('owner_id', a.userId).single()
  const { data } = await a.client
    .from('content_items')
    .insert({ business_id: (business as { id: string }).id, title: 'Fresh vegetables daily', content_type: 'POST', description: 'Fresh vegetables every morning' } as never)
    .select('id')
    .single()
  await login(page, users.a)
  await page.goto(`/dashboard/content/${(data as { id: string }).id}`)
  await expect(page.getByText('No AI content yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Write with AI' }).click()
  await expect(page.getByText('No AI content yet.')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Write with AI' })).toHaveCount(0)
})

test('grouped navigation, business card and attention bell', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 })
  await login(page, users.a)
  const nav = page.getByRole('navigation', { name: 'Menu' })
  for (const group of ['Create content', 'Reach customers', 'My shop']) await expect(nav.getByText(group, { exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: /Shree Ganesh Kirana/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nothing needs your attention' }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
