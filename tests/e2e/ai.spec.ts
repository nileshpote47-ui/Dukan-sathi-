import { expect, test, type Page } from '@playwright/test'
import { cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 3 journey with the MOCK provider (the app must run with AI_PROVIDER=mock):
 * LOGIN → DASHBOARD → CREATE → POST → TEMPLATE → PRODUCT/OFFER → MARATHI → LOCAL TONE →
 * GENERATE → VIEW → EDIT → REGENERATE → EDIT AGAIN → SAVE DRAFT → LIST → OPEN → VERIFY.
 * No paid AI calls are made.
 */
test.describe.configure({ mode: 'serial' })
test.skip(!hasTestUsers, 'Set E2E_USER_A_* and E2E_USER_B_* (see tests/e2e/README.md)')

test.beforeAll(async () => {
  await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
})

test.afterAll(async () => {
  await cleanupBusinesses(users.a, users.b)
})

/** Go to the create flow with a type, fill the basics and continue to the generate step. */
async function toGenerateStep(page: Page, type: string, opts: { title: string; product?: string; language?: string; tone?: string }) {
  await page.goto(`/dashboard/create?type=${type}`)
  await page.getByLabel('Content title', { exact: true }).fill(opts.title)
  if (opts.product) await page.getByLabel(/^Product or service/).fill(opts.product)
  if (opts.language) await page.getByLabel('Language of the content', { exact: true }).selectOption(opts.language)
  if (opts.tone) await page.getByLabel(/^Tone/).selectOption(opts.tone)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Step 3 of 3')).toBeVisible()
}

test('full AI journey: generate in Marathi, edit, regenerate, save, verify', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await expect(page).toHaveURL(/\/dashboard$/)

  // Create → choose Post on step 1
  await page.getByRole('link', { name: 'Create', exact: true }).first().click()
  await page.getByText('Social Post', { exact: true }).click()

  // Template, product, offer, language, tone
  await page.getByText('Product Showcase').click()
  await expect(page.getByLabel(/^What should customers do\?/)).toHaveValue('Visit our shop today')
  await page.getByLabel('Content title', { exact: true }).fill('Weekend rice')
  await page.getByLabel(/^Product or service/).fill('Fresh basmati rice')
  await page.getByLabel(/^Offer/).fill('Special weekend offer')
  await page.getByLabel('Language of the content', { exact: true }).selectOption('mr')
  await page.getByLabel(/^Tone/).selectOption('local')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Generate with AI (explicit action only; nothing generated on page load)
  await expect(page.getByRole('heading', { name: 'Generate and review' })).toBeVisible()
  await expect(page.getByText('Create marketing content using your business profile and preferences.')).toBeVisible()
  await expect(page.getByLabel('Headline')).toHaveCount(0)
  const generate = page.getByRole('button', { name: 'Generate with AI' })
  await generate.click()
  await expect(page.getByRole('button', { name: 'Generating…' })).toBeDisabled() // no duplicate clicks

  // AI result: labelled, per-type fields, Marathi, business context, no invented price
  await expect(page.getByRole('heading', { name: 'AI Generated Content' })).toBeVisible()
  await expect(page.getByText('AI-generated', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Headline')).toHaveValue('Weekend rice')
  const primary = page.getByLabel('Primary text')
  await expect(primary).toHaveValue(/नमस्कार, आपले Shree Ganesh Kirana: Fresh basmati rice/)
  await expect(primary).toHaveValue(/Special weekend offer/)
  await expect(primary).toHaveValue(/\[mock local\]/)
  await expect(primary).not.toHaveValue(/₹|\d+%/)
  await expect(page.getByLabel('Call to action')).toHaveValue('Visit our shop today')
  await expect(page.getByLabel(/^Hashtags/)).toHaveValue('#ShreeGaneshKirana #LocalShop')

  // Edit
  await page.getByLabel('Headline').fill('ताजा बासमती तांदूळ!')

  // Regenerate with a suggestion → new variation; previous can be restored
  await page.getByRole('button', { name: 'Make it shorter' }).click()
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(page.getByLabel('Headline')).toHaveValue(/^नवीन आवृत्ती: Weekend rice/)
  await expect(primary).toHaveValue('नवीन आवृत्ती: Fresh basmati rice. ऑफर: Special weekend offer.')
  await page.getByRole('button', { name: 'Restore previous version' }).click()
  await expect(page.getByLabel('Headline')).toHaveValue('ताजा बासमती तांदूळ!')
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(page.getByLabel('Headline')).toHaveValue(/^नवीन आवृत्ती/)

  // Edit again, then save as draft
  await page.getByLabel('Headline').fill('शनिवार-रविवार खास तांदूळ')
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page).toHaveURL(/\/dashboard\/content\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  // Content list → open → verify saved AI copy
  await page.goto('/dashboard/content')
  await page.getByRole('link', { name: 'Weekend rice', exact: true }).click()
  const aiCard = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'AI Generated Content' }) }).last()
  await expect(page.getByText('शनिवार-रविवार खास तांदूळ')).toBeVisible()
  await expect(page.getByText(/नवीन आवृत्ती: नमस्कार, आपले Shree Ganesh Kirana: Fresh basmati rice/)).toBeVisible()
  await expect(page.getByText(/Generated with mock/)).toBeVisible()
  await expect(page.getByText('Local', { exact: true })).toBeVisible() // tone saved
  await expect(aiCard.getByRole('button', { name: 'Copy text' })).toBeVisible()
  // No publishing happened.
  await expect(page.getByText('Published', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('content type changes the output structure', async ({ page }) => {
  await login(page, users.a)
  await toGenerateStep(page, 'REEL', { title: 'Rice reel', product: 'Fresh basmati rice', language: 'hi', tone: 'energetic' })
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(page.getByLabel('Hook')).toHaveValue('Rice reel')
  await expect(page.getByLabel('Script')).toHaveValue(/नमस्ते, आपका Shree Ganesh Kirana/)
  await expect(page.getByLabel('Headline')).toHaveCount(0)
  await expect(page.getByLabel(/^Hashtags/)).toHaveCount(0)

  await toGenerateStep(page, 'WHATSAPP', { title: 'Hello customers', product: 'Rice', language: 'en', tone: 'friendly' })
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(page.getByLabel('Opening')).toHaveValue('Hello customers')
  await expect(page.getByLabel('Message')).toHaveValue(/Hello from Shree Ganesh Kirana/)

  await toGenerateStep(page, 'OFFER', { title: 'Diwali offer', product: 'Sweets' })
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(page.getByLabel('Promotional text')).toBeVisible()
  await expect(page.getByLabel('Value message')).toBeVisible()
})

test('provider failure and malformed output show a safe error with Try Again', async ({ page }) => {
  await login(page, users.a)
  await toGenerateStep(page, 'POST', { title: 'Failure test' })
  await page.getByLabel('Extra instructions').fill('[mock:fail]')
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'Generation Failed' })
  await expect(alert).toContainText('AI content generation is temporarily unavailable. Please try again.')
  await expect(alert.getByRole('button', { name: 'Try Again' })).toBeVisible()

  await page.getByLabel('Extra instructions').fill('[mock:malformed]')
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(alert).toContainText('AI content generation is temporarily unavailable.')
  await expect(page.getByText(/unexpected|JSON|stack/i)).toHaveCount(0) // no raw errors

  await page.getByLabel('Extra instructions').fill('[mock:rate-limit]')
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(alert).toContainText('Too many requests right now.')

  // A draft can still be saved without AI.
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByText('No AI content yet.')).toBeVisible()
})

test('edit page: regenerating does not overwrite saved copy until Save', async ({ page }) => {
  await login(page, users.a)
  await page.goto('/dashboard/content')
  await page.getByRole('link', { name: 'Weekend rice', exact: true }).click()
  await page.waitForURL(/\/dashboard\/content\/[0-9a-f-]{36}$/)
  const detailUrl = page.url()
  await page.getByRole('link', { name: 'Edit', exact: true }).click()

  await expect(page.getByLabel('Headline')).toHaveValue('शनिवार-रविवार खास तांदूळ')
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(page.getByLabel('Headline')).toHaveValue(/^नवीन आवृत्ती/)
  await expect(page.getByText('Not saved yet. Save to keep this text.')).toBeVisible()

  // Leave without saving: the saved copy is unchanged.
  await page.goto(detailUrl)
  await expect(page.getByText('शनिवार-रविवार खास तांदूळ')).toBeVisible()

  // Regenerate again and save explicitly.
  await page.goto(`${detailUrl}/edit`)
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(page.getByLabel('Headline')).toHaveValue(/^नवीन आवृत्ती/)
  await page.getByRole('button', { name: 'Save AI content' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'AI content saved.' })).toBeVisible()
  await page.goto(detailUrl)
  await expect(page.getByText(/^नवीन आवृत्ती: Weekend rice/)).toBeVisible()
})

test("each user's generation uses only their own business", async ({ page }) => {
  await login(page, users.b)
  await toGenerateStep(page, 'POST', { title: 'Phone sale', product: 'New smartphone', language: 'hi', tone: 'energetic' })
  await page.getByRole('button', { name: 'Generate with AI' }).click()
  await expect(page.getByLabel('Primary text')).toHaveValue(/B Mobiles/)
  await expect(page.getByLabel('Primary text')).not.toHaveValue(/Shree Ganesh/)
})

test('no AI call happens on dashboard, content list or calendar load', async ({ page }) => {
  await login(page, users.a)
  // Server Actions are POSTs with a next-action header; none should run on page loads.
  const aiCalls: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) aiCalls.push(r.url())
  })
  for (const path of ['/dashboard', '/dashboard/content', '/dashboard/calendar', '/dashboard/create?type=POST']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(aiCalls).toEqual([])
})
