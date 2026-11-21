import { expect, test } from '@playwright/test'
import { cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 9: "Let AI design the whole poster" (DIRECT_POSTER_PROVIDER=mock: no cost).
 * The owner's lines are used; the poster is usable only after the owner confirms the text.
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 })
test.skip(!hasTestUsers, 'Set E2E_USER_* (see tests/e2e/README.md)')

let contentId = ''
test.beforeAll(async () => {
  const a = await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  const { data } = await a.client
    .from('content_items')
    .insert({ business_id: a.businessId, title: 'Diwali dry fruits offer', content_type: 'POSTER', product_name: 'Kaju', offer_text: '20% off', price: '₹899/kg' } as never)
    .select('id')
    .single()
  contentId = (data as { id: string }).id
})
test.afterAll(async () => {
  await cleanupBusinesses(users.a)
})

test('AI designs the poster with the owner lines; it can be used only after the owner confirms', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await page.goto(`/dashboard/content/${contentId}/poster`)
  await expect(page.getByText('Or let AI design the whole poster')).toBeVisible()
  await expect(page.getByText(/Uses 1 AI poster · 3 left this month/)).toBeVisible()

  await page.getByRole('button', { name: 'Design with AI' }).click()
  await expect(page.getByRole('img', { name: 'Poster designed by AI' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/Uses 1 AI poster · 2 left this month/)).toBeVisible()
  await expect(page.getByText(/Check every word, the price and the offer/).first()).toBeVisible()

  const use = page.getByRole('button', { name: 'Use this poster' })
  await expect(use).toBeDisabled()
  await page.getByLabel('I checked the spelling, the price and the offer. They are correct.').check()
  await use.click()
  await page.waitForURL(/\/dashboard\/media\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('region', { name: 'Check this AI poster before you use it' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an unconfirmed AI poster asks for the check on its media page', async ({ page }) => {
  await login(page, users.a)
  await page.goto(`/dashboard/content/${contentId}/poster`)
  await page.getByRole('button', { name: 'Design with AI' }).click()
  await expect(page.getByRole('img', { name: 'Poster designed by AI' })).toBeVisible({ timeout: 60_000 })

  // Leave without confirming; open it from the media library.
  await page.goto('/dashboard/media')
  await page.getByRole('link', { name: /Diwali dry fruits offer/ }).first().click()
  const review = page.getByRole('region', { name: 'Check this AI poster before you use it' })
  await expect(review).toBeVisible()
  await review.getByLabel('I checked the spelling, the price and the offer. They are correct.').check()
  await review.getByRole('button', { name: 'Use this poster' }).click()
  await expect(review).toHaveCount(0)
})
