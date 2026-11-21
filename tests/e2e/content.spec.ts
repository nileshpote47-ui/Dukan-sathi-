import { expect, test, type Page } from '@playwright/test'
import { isoToIstInput } from '../../lib/utils/datetime'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 2 journey: LOGIN → DASHBOARD → CREATE → CHOOSE POST → PRODUCT → OFFER →
 * LANGUAGE → REVIEW → SAVE DRAFT → CONTENT LIST → OPEN → EDIT → CHANGE STATUS →
 * SCHEDULE → CALENDAR → DASHBOARD, plus search/filters, lifecycle rules,
 * preferences, settings and user A / user B isolation.
 *
 * Sets up onboarded businesses for both test users through the API, and deletes
 * them afterwards (content is removed with the business), so foundation.spec.ts
 * still starts from users without a business.
 */
test.describe.configure({ mode: 'serial' })
test.skip(!hasTestUsers, 'Set E2E_USER_A_* and E2E_USER_B_* (see tests/e2e/README.md)')

let bContentId = ''

const tomorrowIst = () => isoToIstInput(new Date(Date.now() + 24 * 3600 * 1000).toISOString()).slice(0, 10)

async function openContent(page: Page, title: string) {
  await page.goto('/dashboard/content')
  await page.getByRole('link', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
}

test.beforeAll(async () => {
  await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  const b = await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
  const { data, error } = await b.client
    .from('content_items')
    .insert({ business_id: b.businessId, title: 'B secret phone offer', content_type: 'OFFER', product_name: 'Phones' })
    .select('id')
    .single()
  expect(error).toBeNull()
  bContentId = data!.id
})

test.afterAll(async () => {
  await cleanupBusinesses(users.a, users.b)
})

test('dashboard starts empty with real zero counts and quick actions', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What do you want to sell today?')
  await expect(page.getByRole('main').getByText('Shree Ganesh Kirana', { exact: true }).first()).toBeVisible()
  for (const label of ['Create Post', 'Create Offer', 'Create Poster', 'Create Reel', 'Create WhatsApp Content']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  const overview = page.getByRole('region', { name: 'Your content' })
  await expect(overview.getByRole('link', { name: /Total content\s*0/ })).toBeVisible()
  await expect(overview.getByRole('link', { name: /Drafts\s*0/ })).toBeVisible()
  await expect(page.getByText('Your first marketing content starts here.')).toBeVisible()
  // Incomplete profile prompt links to My Business.
  await expect(page.getByRole('link', { name: 'Go to My Business' })).toBeVisible()
  expect(errors).toEqual([])
})

test('full journey: create post → list → edit → ready → schedule → calendar → dashboard', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)

  // Quick action opens the shared flow with the type preselected.
  await page.getByRole('link', { name: 'Create Post', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/create\?type=POST/)
  await expect(page.getByText('Step 2 of 3')).toBeVisible()
  await expect(page.getByText(/type:\s*Social Post/i)).toBeVisible()

  // Validation: title is required.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('This field is required.')).toBeVisible()

  await page.getByLabel('Content title', { exact: true }).fill('Weekend rice offer')
  await expect(page.getByLabel(/^Product\ or\ service/)).toHaveAttribute('placeholder', /Basmati rice/) // grocery example
  await page.getByLabel(/^Product\ or\ service/).fill('Basmati rice 5 kg')
  await page.getByLabel(/^Offer/).fill('10% off this weekend')
  await page.getByLabel(/^Price/).fill('₹450')
  await page.getByLabel('Language of the content', { exact: true }).selectOption('mr')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Review (details are in a collapsible summary on the generate step)
  await expect(page.getByText('Step 3 of 3')).toBeVisible()
  await page.getByText('Your details:').click()
  await expect(page.getByText('Basmati rice 5 kg')).toBeVisible()
  await expect(page.getByText('मराठी')).toBeVisible()
  await page.getByRole('button', { name: 'Save as draft' }).click()

  // Detail page
  await expect(page).toHaveURL(/\/dashboard\/content\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Weekend rice offer' })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  const contentUrl = page.url()

  // List, search and filters
  await page.goto('/dashboard/content')
  await expect(page.getByText('1 items')).toBeVisible()
  await page.getByLabel('Search', { exact: true }).fill('basmati')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/q=basmati/)
  await expect(page.getByRole('link', { name: 'Weekend rice offer', exact: true })).toBeVisible()
  await page.getByLabel('Search', { exact: true }).fill('no-such-thing')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('No content matches')).toBeVisible()
  await page.goto('/dashboard/content?type=OFFER')
  await expect(page.getByText('No content matches')).toBeVisible()
  await page.goto('/dashboard/content?type=POST&status=DRAFT&view=grid')
  await expect(page.getByRole('link', { name: 'Weekend rice offer', exact: true })).toBeVisible()

  // Open and edit
  await openContent(page, 'Weekend rice offer')
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel(/^Price/)).toHaveValue('₹450')
  await page.getByLabel(/^Price/).fill('₹420')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(contentUrl)
  await expect(page.getByText('₹420')).toBeVisible()

  // Status: draft → ready → scheduled (past date rejected first)
  await page.getByRole('button', { name: 'Mark as ready' }).click()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Schedule' }).click()
  await page.getByLabel('Date and time (India time)', { exact: true }).fill('2020-01-01T10:00')
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await expect(page.getByText('Choose a date and time in the future.')).toBeVisible()
  const day = tomorrowIst()
  await page.getByLabel('Date and time (India time)', { exact: true }).fill(`${day}T10:30`)
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await expect(page.getByText('Scheduled', { exact: true })).toBeVisible()
  await expect(page.getByText(/Scheduled for:/)).toBeVisible()
  await expect(page.getByText(/Scheduling here plans the date in your calendar/).first()).toBeVisible()

  // Calendar shows it on the right day and in Upcoming.
  await page.goto(`/dashboard/calendar?month=${day.slice(0, 7)}&day=${day}`)
  await expect(page.getByRole('heading', { name: /Planned for/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Weekend rice offer/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /1 planned/ })).toBeVisible()

  // Dashboard counts come from the database.
  await page.goto('/dashboard')
  const overview = page.getByRole('region', { name: 'Your content' })
  await expect(overview.getByRole('link', { name: /Total content\s*1/ })).toBeVisible()
  await expect(overview.getByRole('link', { name: /Scheduled\s*1/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recent content' }).getByText('Weekend rice offer')).toBeVisible()

  // Scheduled → back to draft clears the date.
  await page.goto(contentUrl)
  await page.getByRole('button', { name: 'Move back to draft' }).click()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  await expect(page.getByText(/Scheduled for:/)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('lifecycle rules: ready needs details, archive is read-only, delete asks first', async ({ page }) => {
  await login(page, users.a)
  await page.goto('/dashboard/create')
  await expect(page.getByText('Step 1 of 3')).toBeVisible()
  await page.getByText('Offer', { exact: true }).click() // type card
  await page.getByLabel('Content title', { exact: true }).fill('Just an idea')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Just an idea' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark as ready' }).click()
  await expect(page.getByText('Add a product, offer or description first.')).toBeVisible()

  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByRole('dialog')).toContainText('Archive this content?')
  await page.getByRole('button', { name: 'Yes, archive' }).click()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()
  await expect(page.getByText('Archived content is read-only.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0)

  // Delete: cancel first, then confirm.
  await page.getByRole('button', { name: 'Delete: Just an idea' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Just an idea' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete: Just an idea' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page).toHaveURL(/\/dashboard\/content$/)
  await expect(page.getByRole('link', { name: 'Just an idea', exact: true })).toHaveCount(0)
})

test('templates and marketing preferences feed the create form', async ({ page }) => {
  await login(page, users.a)
  // Template fills the call to action when it is empty.
  await page.goto('/dashboard/create?type=OFFER')
  await page.getByText('Special Offer').click()
  await expect(page.getByLabel(/^What\ should\ customers\ do\?/)).toHaveValue('Grab this offer now')

  // Marketing preferences
  await page.goto('/dashboard/business')
  await page.getByRole('link', { name: 'Edit preferences' }).click()
  await page.getByLabel(/^Tone/).selectOption('friendly')
  await page.getByLabel(/^Usual\ call\ to\ action/).fill('Visit Shree Ganesh today')
  await page.getByLabel(/^How\ should\ customers\ contact\ you\?/).selectOption('whatsapp')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/business$/)
  await expect(page.getByText('Friendly')).toBeVisible()
  await expect(page.getByText('Visit Shree Ganesh today')).toBeVisible()

  // The preferred call to action is the default for new content.
  await page.goto('/dashboard/create?type=POST')
  await expect(page.getByLabel(/^What\ should\ customers\ do\?/)).toHaveValue('Visit Shree Ganesh today')
})

test('settings: change app language and back', async ({ page }) => {
  await login(page, users.a, '/dashboard/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByText('e2e-owner-a@')).toBeVisible()
  await page.getByLabel('मराठी').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'सेटिंग्ज' })).toBeVisible()
  await page.getByLabel('English').check()
  await page.getByRole('button', { name: 'जतन करा' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})

test("user A cannot open or change user B's content (URL and API)", async ({ page }) => {
  await login(page, users.a)
  await page.goto(`/dashboard/content/${bContentId}`)
  await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible()
  await page.goto(`/dashboard/content/${bContentId}/edit`)
  await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible()
  await page.goto('/dashboard/content/not-a-uuid')
  await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible()

  const a = await apiClientFor(users.a)
  const { data: read } = await a.client.from('content_items').select('id').eq('id', bContentId)
  expect(read).toEqual([])
  const { data: updated } = await a.client.from('content_items').update({ title: 'Hacked' }).eq('id', bContentId).select()
  expect(updated).toEqual([])
  const { data: deleted } = await a.client.from('content_items').delete().eq('id', bContentId).select()
  expect(deleted).toEqual([])

  const b = await apiClientFor(users.b)
  const { data: still } = await b.client.from('content_items').select('title').eq('id', bContentId).single()
  expect(still?.title).toBe('B secret phone offer')
})

test('phone layout: no sideways scrolling on Phase 2 pages', async ({ page }) => {
  await login(page, users.a)
  for (const path of ['/dashboard', '/dashboard/create', '/dashboard/content', '/dashboard/calendar', '/dashboard/settings', '/dashboard/business/marketing']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
  // Mobile navigation reaches every section.
  await page.goto('/dashboard')
  for (const label of ['Create', 'Content', 'Calendar']) {
    await expect(page.getByRole('navigation').last().getByRole('link', { name: label })).toBeVisible()
  }
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link', { name: /Analytics/ })).not.toContainText('Coming soon')
})
