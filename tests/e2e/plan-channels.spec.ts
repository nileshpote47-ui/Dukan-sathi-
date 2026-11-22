import { expect, test } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, users } from './helpers'

/*
 * Channels per plan (owner's decision), on the Free plan with MOCK social providers (PUBLISHING_PROVIDER=mock):
 * Free connects ONE account — a Facebook Page or Instagram, the owner's choice — and nothing else.
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 })
test.skip(!hasTestUsers || !process.env.PUBLISHING_SERVER_SECRET, 'Set E2E_USER_* and PUBLISHING_SERVER_SECRET (see tests/e2e/README.md)')

test.beforeAll(async () => {
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
})
test.afterAll(async () => {
  await cleanupBusinesses(users.b)
})

const card = (page: import('@playwright/test').Page, name: string) => page.locator(`div[aria-label="${name}"]`)

test('Free plan: one account, Facebook Page or Instagram; other channels name the plans that include them', async ({ page }) => {
  await login(page, users.b)
  await page.goto('/dashboard/accounts')
  await expect(card(page, 'Facebook & Instagram').getByText('Free plan: connect ONE account — Facebook Page or Instagram.')).toBeVisible()
  await expect(card(page, 'WhatsApp Business').getByText('Available on: Growth, Premium.')).toBeVisible()
  await expect(card(page, 'YouTube').getByText('Available on: Growth, Premium.')).toBeVisible()
  await expect(card(page, 'Google Business Profile').getByText('Available on: Starter, Growth, Premium.')).toBeVisible()
  await expect(card(page, 'WhatsApp Business').getByRole('button', { name: 'Connect WhatsApp' })).toHaveCount(0)

  // Connect Instagram only (the mock Meta login returns a Page and an Instagram account).
  await card(page, 'Facebook & Instagram').getByRole('link', { name: 'Instagram', exact: true }).click()
  await expect(page.getByText('1 account(s) connected.')).toBeVisible()
  const { client } = await apiClientFor(users.b)
  const { data } = await client.from('social_accounts').select('channel, status')
  expect(data).toEqual([{ channel: 'INSTAGRAM', status: 'CONNECTED' }])
  await expect(card(page, 'Facebook & Instagram').getByText('Free plan: 1 connected account. To add another, remove this one or upgrade.')).toBeVisible()

  // The server refuses a second account and other channels even when the links are typed by hand.
  await page.goto('/api/social/meta/connect?only=FACEBOOK')
  await expect(page.getByText('Your plan allows no more connected accounts. Remove one first or see plans.')).toBeVisible()
  await page.goto('/api/social/youtube/connect')
  await expect(page.getByText('Your plan does not include this channel.')).toBeVisible()
  expect((await client.from('social_accounts').select('id')).data).toHaveLength(1)

  // Pricing lists the channels per plan.
  await page.goto('/pricing')
  await expect(page.getByText('Channels: Instagram, Facebook').first()).toBeVisible()
  await expect(page.getByText('Connected accounts: 1')).toBeVisible()
})
