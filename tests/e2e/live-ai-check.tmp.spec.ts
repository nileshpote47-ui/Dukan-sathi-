import { expect, test } from '@playwright/test'
import { cleanupBusinesses, login, resetBusiness, users } from './helpers'

// Temporary (not committed): the three real-world cases from the Phase 3 spec, on the live site with real Gemini.
const cases = [
  { name: 'grocery', business: 'Shree Ganesh Kirana', category: 'grocery', type: 'POST', title: 'Weekend rice', product: 'Fresh basmati rice', offer: 'Special weekend offer', language: 'mr', tone: 'local' },
  { name: 'mobile_shop', business: 'Sai Mobile Point', category: 'mobile_shop', type: 'POST', title: 'New smartphone', product: 'New smartphone', offer: '', language: 'hi', tone: 'energetic' },
  { name: 'salon', business: 'Glow Salon', category: 'salon', type: 'POST', title: 'Hair styling', product: 'Hair styling', offer: '', language: 'en', tone: 'premium' },
]

test.describe.configure({ mode: 'serial' })
test.afterAll(async () => cleanupBusinesses(users.a))

for (const c of cases) {
  test(`real Gemini: ${c.name}`, async ({ page }) => {
    test.setTimeout(120_000)
    await resetBusiness(users.a, c.business, c.category)
    await login(page, users.a)
    await page.goto(`/dashboard/create?type=${c.type}`)
    await page.getByLabel('Content title', { exact: true }).fill(c.title)
    await page.getByLabel(/^Product or service/).fill(c.product)
    if (c.offer) await page.getByLabel(/^Offer/).fill(c.offer)
    await page.getByLabel('Language of the content', { exact: true }).selectOption(c.language)
    await page.getByLabel(/^Tone/).selectOption(c.tone)
    await page.getByRole('button', { name: 'Continue' }).click()
    const started = Date.now()
    await page.getByRole('button', { name: 'Generate with AI' }).click()
    await expect(page.getByRole('heading', { name: 'AI Generated Content' }).or(page.getByText('Generation Failed'))).toBeVisible({ timeout: 60_000 })
    const out: Record<string, string> = {}
    out.error = (await page.getByRole('alert').filter({ hasText: 'Generation Failed' }).count())
      ? await page.getByRole('alert').filter({ hasText: 'Generation Failed' }).innerText()
      : ''
    if (!out.error) {
      for (const label of ['Headline', 'Primary text', 'Call to action']) out[label] = await page.getByLabel(label).inputValue({ timeout: 2000 })
      out['Hashtags'] = await page.getByLabel(/^Hashtags/).inputValue({ timeout: 2000 }).catch(() => '')
    }
    console.log(`\n=== ${c.name} (${c.language}, ${c.tone}) in ${Date.now() - started} ms ===\n${JSON.stringify(out, null, 2)}`)
    expect(out.error).toBe('')
  })
}
