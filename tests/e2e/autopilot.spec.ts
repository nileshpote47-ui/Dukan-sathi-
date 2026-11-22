import { expect, request, test, type Page } from '@playwright/test'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Premium Autopilot with MOCK AI and MOCK social providers. Needs (tests/e2e/README.md):
 *   * the app started with AI_PROVIDER=mock, PUBLISHING_PROVIDER=mock, PUBLISHING_SERVER_SECRET, AUTOPILOT_TEST_CLOCK=1
 *   * E2E_PLAN=premium and a temporary Premium subscription for user A's new shop (the setup waits for it)
 * The generator is called the way the scheduler calls it, with a fixed "now" (next Monday 06:00 India time) so a
 * whole week is planned.
 */
test.describe.configure({ mode: 'serial', timeout: 180_000 })
const serverSecret = process.env.PUBLISHING_SERVER_SECRET ?? ''
test.skip(!hasTestUsers || !serverSecret, 'Set E2E_USER_* and PUBLISHING_SERVER_SECRET (see tests/e2e/README.md)')
test.skip(process.env.E2E_PLAN !== 'premium', 'Needs a temporary Premium subscription for user A (E2E_PLAN=premium, see README)')

let businessId = ''

/** Next Monday 06:00 India time, as an ISO string. */
function nextMonday(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000)
  const days = ((8 - ist.getUTCDay()) % 7) || 7
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days))
  return new Date(`${day.toISOString().slice(0, 10)}T06:00:00+05:30`).toISOString()
}

test.beforeAll(async () => {
  test.setTimeout(420_000)
  const a = await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
  businessId = a.businessId
  console.log(`[e2e] waiting for a Premium subscription for business ${a.businessId}`)
  await expect
    .poll(async () => (await a.client.from('business_subscriptions').select('id').eq('status', 'ACTIVE')).data?.length ?? 0, { timeout: 360_000, intervals: [5_000] })
    .toBeGreaterThan(0)
})
test.afterAll(async () => {
  const { client, userId } = await apiClientFor(users.a)
  for (const folder of [userId, `${userId}/publishing`]) {
    const { data } = await client.storage.from('business-media').list(folder)
    const files = (data ?? []).filter((f) => f.id)
    if (files.length) await client.storage.from('business-media').remove(files.map((f) => `${folder}/${f.name}`))
  }
  await cleanupBusinesses(users.a, users.b)
})

// Called like the scheduler: no browser session at all (a fresh request context), only the secret.
const runGenerator = async (page: Page, secret = serverSecret) => {
  const context = await request.newContext({ baseURL: new URL(page.url() === 'about:blank' ? process.env.E2E_BASE_URL ?? 'http://localhost:3000' : page.url()).origin })
  const response = await context.post('/api/autopilot/run', { headers: { Authorization: `Bearer ${secret}` }, data: { now: nextMonday() }, maxRedirects: 0 })
  const result = { status: response.status(), body: response.status() === 200 ? await response.json() : null }
  await context.dispose()
  return result
}

test('Autopilot: turn on, weekly posts prepared from ideas + own offers, approve, skip, approve all', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  const { client } = await apiClientFor(users.a)
  const usedBefore = ((await client.rpc('billing_usage_summary')).data ?? []).find((r) => r.feature_key === 'ai_text_generation')?.used ?? 0

  // Premium connects Facebook + Instagram in one login.
  await page.goto('/dashboard/accounts')
  await page.locator('div[aria-label="Facebook & Instagram"]').getByRole('link', { name: 'Connect' }).click()
  await expect(page.getByText('2 account(s) connected.')).toBeVisible()

  await page.goto('/dashboard/autopilot')
  await expect(page.getByRole('heading', { name: 'Autopilot', level: 1 })).toBeVisible()
  await expect(page.getByText('WhatsApp: coming soon (after WhatsApp Business is set up).')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Turn on Autopilot' }).check()
  await page.getByRole('checkbox', { name: /Facebook/ }).check()
  await page.getByRole('checkbox', { name: /Instagram/ }).check()
  await page.getByLabel('Time (India time)').selectOption('10:00')
  await page.getByLabel(/Your offers and prices to use/).fill('Cashews ₹899/kg · Free home delivery above ₹500')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText("Autopilot is on. This week's posts will be ready within an hour.")).toBeVisible()

  // The scheduler's call: without the secret nothing happens; with it the week is prepared once.
  expect((await runGenerator(page, 'wrong-secret')).status).toBe(401)
  expect((await runGenerator(page)).body).toMatchObject({ ok: true, businesses: 1, posts: 5 })
  expect((await runGenerator(page)).body).toMatchObject({ ok: true, posts: 0 }) // once per week

  const { data: posts } = await client.from('autopilot_posts').select('id, status, planned_for, content_item_id').order('planned_for')
  expect(posts).toHaveLength(5)
  const { data: items } = await client.from('content_items').select('status, offer_text, generated_copy').in('id', posts!.map((p) => p.content_item_id))
  expect(items!.every((i) => i.status === 'DRAFT' && i.offer_text === 'Cashews ₹899/kg · Free home delivery above ₹500' && i.generated_copy)).toBe(true)
  const usedAfter = ((await client.rpc('billing_usage_summary')).data ?? []).find((r) => r.feature_key === 'ai_text_generation')?.used ?? 0
  expect(usedAfter - usedBefore).toBe(5)

  // The bell and the dashboard point to the posts waiting for approval.
  await page.goto('/dashboard')
  await page.getByRole('link', { name: /Autopilot: 5 posts are ready for your approval/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/autopilot/)
  const cards = page.getByRole('list').last().getByRole('listitem')
  await expect(cards).toHaveCount(5)
  await expect(cards.first().getByText('Waiting for you')).toBeVisible()

  // Approve one: its poster is made from its own text and it is scheduled on Facebook + Instagram.
  await cards.first().getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(cards.first().getByText('Approved · scheduled')).toBeVisible({ timeout: 30_000 })
  let { data: jobs } = await client.from('publishing_jobs').select('channel, status, publish_mode, media_asset_id, scheduled_for')
  expect(jobs!.map((j) => j.channel).sort()).toEqual(['FACEBOOK', 'INSTAGRAM'])
  expect(jobs!.every((j) => j.status === 'QUEUED' && j.publish_mode === 'SCHEDULED' && j.media_asset_id)).toBe(true)
  expect(Date.parse(jobs![0].scheduled_for!)).toBe(Date.parse(posts![0].planned_for))

  // Skip one; approve all the rest at once.
  await cards.nth(1).getByRole('button', { name: 'Skip' }).click()
  await expect(cards.nth(1).getByText('Skipped')).toBeVisible()
  await page.getByRole('button', { name: 'Approve all 3' }).click()
  await expect(page.getByText('Approved · scheduled')).toHaveCount(4, { timeout: 60_000 })
  ;({ data: jobs } = await client.from('publishing_jobs').select('id'))
  expect(jobs).toHaveLength(8)
  const { data: decided } = await client.from('autopilot_posts').select('status')
  expect(decided!.map((p) => p.status).sort()).toEqual(['SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SKIPPED'])
  expect(errors).toEqual([])
})

test('Autopilot security: other owners see nothing; decisions and run markers cannot be forged', async ({ page }) => {
  const a = await apiClientFor(users.a)
  const b = await apiClientFor(users.b)
  expect((await b.client.from('autopilot_posts').select('id')).data).toEqual([])
  expect((await b.client.from('autopilot_settings').select('business_id')).data).toEqual([])
  const { data: own } = await a.client.from('autopilot_posts').select('id').eq('status', 'SKIPPED').single()
  // B cannot touch A's post; A cannot reopen a decided post or change its time.
  expect((await b.client.from('autopilot_posts').update({ status: 'SCHEDULED' } as never).eq('id', own!.id).select('id')).data ?? []).toEqual([])
  expect((await a.client.from('autopilot_posts').update({ status: 'PENDING' } as never).eq('id', own!.id)).error).not.toBeNull()
  // Owners cannot create posts or reset the weekly marker (only the generator can).
  expect((await a.client.from('autopilot_posts').insert({ business_id: businessId, owner_id: a.userId } as never)).error).not.toBeNull()
  await a.client.from('autopilot_settings').update({ last_run_week: null } as never).eq('business_id', businessId)
  expect((await a.client.from('autopilot_settings').select('last_run_week').single()).data!.last_run_week).not.toBeNull()
  // The generator functions refuse callers without the server secret.
  expect((await a.client.rpc('autopilot_due', { p_secret: 'x'.repeat(40), p_week_start: '2026-11-23' })).error).not.toBeNull()
  await page.goto('/')
  const anonymous = await request.newContext({ baseURL: new URL(page.url()).origin })
  expect((await anonymous.post('/api/autopilot/run', { maxRedirects: 0 })).status()).toBe(401)
  await anonymous.dispose()
})

test('plans without Autopilot see what it is and where to get it', async ({ page }) => {
  await login(page, users.b)
  await page.goto('/dashboard/autopilot')
  await expect(page.getByText('Autopilot is part of: Premium')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Turn on Autopilot' })).toHaveCount(0)
})
