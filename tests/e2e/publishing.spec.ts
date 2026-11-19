import { createHmac } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { apiClientFor, cleanupBusinesses, hasTestUsers, login, resetBusiness, trackPageErrors, users } from './helpers'

/*
 * Phase 6 journeys with MOCK social providers (app started with PUBLISHING_PROVIDER=mock,
 * PUBLISHING_SERVER_SECRET, SOCIAL_TOKEN_ENCRYPTION_KEY and META_APP_SECRET — see
 * tests/e2e/README.md). No real platform is called; the mock OAuth "dialog" redirects straight
 * back and captions with [mock:…] markers choose a provider outcome.
 */
test.describe.configure({ mode: 'serial', timeout: 150_000 })
const serverSecret = process.env.PUBLISHING_SERVER_SECRET ?? ''
const metaAppSecret = process.env.META_APP_SECRET ?? ''
test.skip(!hasTestUsers || !serverSecret || !metaAppSecret, 'Set E2E_USER_*, PUBLISHING_SERVER_SECRET and META_APP_SECRET (see tests/e2e/README.md)')

let ids: { aBusiness: string; aUser: string; content: string; draft: string; poster: string }

test.beforeAll(async () => {
  const a = await resetBusiness(users.a, 'Shree Ganesh Kirana', 'grocery')
  await resetBusiness(users.b, 'B Mobiles', 'mobile_shop')
  const insert = async (title: string, ready: boolean) => {
    const { data } = await a.client
      .from('content_items')
      .insert({ business_id: a.businessId, title, content_type: 'OFFER', product_name: 'Basmati rice', offer_text: '10% off this week', generated_copy: { headline: 'Diwali rice offer', primary_text: 'Fresh basmati rice at our shop.', call_to_action: 'Visit today', hashtags: ['#Diwali', '#Shirur'] } } as never)
      .select('id')
      .single()
    if (ready) await a.client.from('content_items').update({ status: 'READY' } as never).eq('id', data!.id)
    return data!.id as string
  }
  const content = await insert('Diwali rice offer', true)
  const draft = await insert('Draft idea', false)

  // A 4:5 PNG poster for the content (Instagram needs JPEG: the server converts it).
  const png = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0f766e' } }).png().toBuffer()
  const path = `${a.userId}/e2e-poster-${Date.now()}.png`
  const upload = await a.client.storage.from('business-media').upload(path, png, { contentType: 'image/png' })
  expect(upload.error).toBeNull()
  const { data: poster, error } = await a.client
    .from('media_assets')
    .insert({ business_id: a.businessId, owner_id: a.userId, content_item_id: content, asset_type: 'POSTER', source_type: 'TEMPLATE_RENDERED', status: 'READY', storage_path: path, mime_type: 'image/png', width: 1080, height: 1350, file_size: png.length } as never)
    .select('id')
    .single()
  expect(error).toBeNull()
  ids = { aBusiness: a.businessId, aUser: a.userId, content, draft, poster: poster!.id }
})

test.afterAll(async () => {
  for (const user of [users.a, users.b]) {
    const { client, userId } = await apiClientFor(user)
    for (const folder of [userId, `${userId}/publishing`]) {
      const { data } = await client.storage.from('business-media').list(folder)
      const files = (data ?? []).filter((f) => f.id)
      if (files.length) await client.storage.from('business-media').remove(files.map((f) => `${folder}/${f.name}`))
    }
  }
  await cleanupBusinesses(users.a, users.b)
})

async function rows(user = users.a) {
  const { client } = await apiClientFor(user)
  const [accounts, jobs, usage, messages, contacts] = await Promise.all([
    client.from('social_accounts').select('id, channel, status, external_account_name, provider').eq('business_id', ids.aBusiness),
    client.from('publishing_jobs').select('id, channel, status, external_post_id, error_code, scheduled_for, publish_mode').eq('business_id', ids.aBusiness).order('created_at'),
    client.rpc('billing_usage_summary'),
    client.from('whatsapp_messages').select('wamid, status, contact_id'),
    client.from('whatsapp_contacts').select('id, name, phone_e164, opted_out_by').eq('business_id', ids.aBusiness),
  ])
  return {
    accounts: accounts.data ?? [],
    jobs: jobs.data ?? [],
    used: (usage.data ?? []).find((u) => u.feature_key === 'social_publishing')?.used ?? 0,
    messages: messages.data ?? [],
    contacts: contacts.data ?? [],
  }
}

const card = (page: Page, name: string) => page.locator(`div[aria-label="${name}"]`)

async function openPublish(page: Page) {
  await page.goto(`/dashboard/content/${ids.content}`)
  await page.getByRole('link', { name: 'Publish' }).click()
  await expect(page.getByRole('heading', { name: 'Publish “Diwali rice offer”' })).toBeVisible()
}

async function publishTo(page: Page, account: RegExp, opts: { caption?: string; schedule?: string; repeat?: boolean } = {}) {
  await openPublish(page)
  await page.getByRole('radio', { name: account }).check()
  if (opts.caption !== undefined) await page.getByLabel('Post text').fill(opts.caption)
  if (opts.schedule) {
    await page.getByRole('radio', { name: 'Schedule' }).check()
    await page.getByLabel('Date and time (India time)').fill(opts.schedule)
  }
  if (opts.repeat) await page.getByRole('checkbox', { name: 'Publish it again anyway' }).check()
  await page.getByRole('checkbox', { name: /I checked this post/ }).check()
  await page.getByRole('button', { name: opts.schedule ? 'Schedule post' : /Publish now|Send now/ }).click()
  await page.waitForURL(/\/dashboard\/publishing\?job=/)
  return new URL(page.url()).searchParams.get('job')!
}

/** India time "YYYY-MM-DDTHH:mm" some minutes from now. */
const istIn = (minutes: number) => new Date(Date.now() + minutes * 60_000 + 5.5 * 3_600_000).toISOString().slice(0, 16)

test('connect accounts: Meta (Facebook + Instagram), Google Business Profile, YouTube, WhatsApp; bad OAuth state is refused', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await page.goto('/dashboard/accounts')
  await expect(page.getByRole('heading', { name: 'Connected accounts' })).toBeVisible()

  await card(page, 'Facebook & Instagram').getByRole('link', { name: 'Connect' }).click()
  await expect(page.getByText('2 account(s) connected.')).toBeVisible()
  await expect(card(page, 'Facebook & Instagram').getByText('Mock Shop Page', { exact: true })).toBeVisible()
  await expect(card(page, 'Facebook & Instagram').getByText('@mock_shop', { exact: true })).toBeVisible()

  await card(page, 'Google Business Profile').getByRole('link', { name: 'Connect' }).click()
  await expect(page.getByText('1 account(s) connected.')).toBeVisible()
  await card(page, 'YouTube').getByRole('link', { name: 'Connect' }).click()
  await expect(card(page, 'YouTube').getByText('Mock Shop Channel', { exact: true })).toBeVisible()
  await card(page, 'WhatsApp Business').getByRole('button', { name: 'Connect WhatsApp' }).click()
  await expect(card(page, 'WhatsApp Business').getByText('Mock Shop (+91 90000 00000)', { exact: true })).toBeVisible()

  const r = await rows()
  expect(r.accounts.map((a) => a.channel).sort()).toEqual(['FACEBOOK', 'GOOGLE_BUSINESS_PROFILE', 'INSTAGRAM', 'WHATSAPP', 'YOUTUBE'])
  expect(r.accounts.every((a) => a.status === 'CONNECTED')).toBe(true)
  // Tokens never reach the browser.
  expect(await page.content()).not.toContain('mock_token_')

  // A callback without a matching state cookie is rejected (CSRF protection).
  await page.goto('/api/social/meta/callback?code=mock_code&state=forged')
  await expect(page.getByText('The connection link expired. Please start again.')).toBeVisible()
  // Refused permissions at the platform.
  await page.goto('/api/social/meta/connect')
  await page.goto('/api/social/meta/callback?error=access_denied&state=x')
  await expect(page.getByRole('alert').filter({ hasText: /expired|cancelled/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('publish now to Instagram: validation, preview, JPEG picture, external id, content PUBLISHED, one credit', async ({ page }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  const before = (await rows()).used

  // Draft content cannot be published.
  await page.goto(`/dashboard/content/${ids.draft}/publish`)
  await expect(page.getByText('Mark the content as Ready before publishing.')).toBeVisible()

  await openPublish(page)
  await page.getByRole('radio', { name: /Instagram/ }).check()
  // YouTube is listed but cannot be chosen (no video export yet).
  await expect(page.getByRole('radio', { name: /YouTube/ })).toBeDisabled()
  // Caption pre-filled from the saved AI copy, with hashtags for Instagram.
  await expect(page.getByLabel('Post text')).toHaveValue(/Diwali rice offer[\s\S]*#Diwali #Shirur/)
  await expect(page.getByLabel('Preview').getByText('Fresh basmati rice at our shop.')).toBeVisible()
  // Publishing needs an explicit confirmation.
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText('Please confirm that you checked the post.')).toBeVisible()

  await page.getByRole('checkbox', { name: /I checked this post/ }).check()
  await page.getByRole('button', { name: 'Publish now' }).click()
  await page.waitForURL(/\/dashboard\/publishing\?job=/)
  await expect(page.getByText('Published on Instagram.')).toBeVisible()
  const published = page.getByRole('listitem').filter({ hasText: 'Diwali rice offer' }).first()
  await expect(published.getByText('Published', { exact: true })).toBeVisible()
  await expect(published.getByRole('link', { name: 'View post' })).toHaveAttribute('href', /^https:\/\/example\.com\/mock\/instagram\//)

  const r = await rows()
  const job = r.jobs.find((j) => j.channel === 'INSTAGRAM')!
  expect(job.status).toBe('PUBLISHED')
  expect(job.external_post_id).toMatch(/^mock_post_/)
  expect(r.used).toBe(before + 1)
  const { client } = await apiClientFor(users.a)
  const { data: content } = await client.from('content_items').select('status').eq('id', ids.content).single()
  expect(content!.status).toBe('PUBLISHED')
  expect(errors).toEqual([])
})

test('duplicates need confirmation; schedule, see it under Scheduled, cancel it', async ({ page }) => {
  await login(page, users.a)
  await openPublish(page)
  await page.getByRole('radio', { name: /Instagram/ }).check()
  await expect(page.getByText('This content was already published on this account.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish now' })).toBeDisabled()

  const jobId = await publishTo(page, /Facebook/, { schedule: istIn(90), caption: 'Diwali rice offer this week!' })
  await expect(page.getByText('Scheduled. It will be published at the chosen time.')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Scheduled/ })).toHaveAttribute('aria-current', 'page')
  const scheduled = page.locator(`#job-${jobId}`)
  await expect(scheduled.getByText('Scheduled', { exact: true })).toBeVisible()
  let r = await rows()
  expect(r.jobs.find((j) => j.id === jobId)).toMatchObject({ status: 'QUEUED', publish_mode: 'SCHEDULED' })

  await scheduled.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(page.getByText('Post cancelled.')).toBeVisible()
  r = await rows()
  expect(r.jobs.find((j) => j.id === jobId)!.status).toBe('CANCELLED')
})

test('failures: rejection and permission problems use no credit; expired access → reconnect; explicit retry; temporary limits retry later', async ({ page }) => {
  await login(page, users.a)
  const before = (await rows()).used

  let jobId = await publishTo(page, /Google Business Profile/, { caption: 'Open on Sunday [mock:reject]' })
  await expect(page.locator(`#job-${jobId}`).getByText('The platform did not accept this post. Change the text and try again.')).toBeVisible()
  await expect(page.locator(`#job-${jobId}`).getByRole('button', { name: 'Try again' })).toHaveCount(0)

  jobId = await publishTo(page, /Facebook/, { caption: 'Big sale [mock:expired]' })
  await expect(page.locator(`#job-${jobId}`).getByText('Access to this account has expired. Reconnect the account, then try again.')).toBeVisible()
  await expect(page.locator(`#job-${jobId}`).getByRole('link', { name: 'Reconnect account' })).toBeVisible()
  expect((await rows()).accounts.find((a) => a.channel === 'FACEBOOK')!.status).toBe('EXPIRED')

  // An expired account must be reconnected before it can publish again.
  await page.goto('/dashboard/accounts')
  await expect(page.getByText('Needs reconnect')).toBeVisible()
  await card(page, 'Facebook & Instagram').getByRole('link', { name: 'Reconnect' }).click()
  await expect(page.getByText('2 account(s) connected.')).toBeVisible()
  expect((await rows()).accounts.find((a) => a.channel === 'FACEBOOK')!.status).toBe('CONNECTED')

  // A permission problem fails; the owner retries explicitly and every attempt is recorded.
  jobId = await publishTo(page, /Facebook/, { caption: 'Big sale [mock:permission]' })
  const failed = page.locator(`#job-${jobId}`)
  await expect(failed.getByText(/not allowed to post here/)).toBeVisible()
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Trying again…')).toBeVisible()
  await expect(page.locator(`#job-${jobId}`).getByText('Attempts: 2', { exact: false })).toBeVisible()
  expect((await rows()).jobs.find((j) => j.id === jobId)!.status).toBe('FAILED')

  // A temporary rate limit is queued for a limited automatic retry.
  jobId = await publishTo(page, /Facebook/, { caption: 'Weekend offer [mock:rate_limit]' })
  await expect(page.locator(`#job-${jobId}`).getByText(/Will try again automatically/)).toBeVisible()
  expect((await rows()).used).toBe(before)
})

test('WhatsApp: opted-in customers only, approved template, per-recipient results, signed status webhooks and STOP', async ({ page, request }) => {
  const errors = trackPageErrors(page)
  await login(page, users.a)
  await page.goto('/dashboard/accounts/whatsapp')
  await expect(page.getByRole('heading', { name: 'WhatsApp customers' })).toBeVisible()

  // Consent is required.
  await page.getByLabel('Name').fill('Ravi')
  await page.getByLabel('WhatsApp number').fill('98765 43210')
  await page.getByRole('button', { name: 'Add customer' }).click()
  await expect(page.getByText('Confirm the customer agreed to receive messages.')).toBeVisible()
  await page.getByRole('checkbox', { name: /agreed to receive offers/ }).check()
  await page.getByRole('button', { name: 'Add customer' }).click()
  await expect(page.getByRole('listitem', { name: 'Ravi' })).toBeVisible()
  for (const [name, phone] of [['Sunita', '98765 00000'], ['Opted out', '91234 56789']]) {
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('WhatsApp number').fill(phone)
    await page.getByRole('checkbox', { name: /agreed to receive offers/ }).check()
    await page.getByRole('button', { name: 'Add customer' }).click()
    await expect(page.getByRole('listitem', { name })).toBeVisible()
  }
  await page.getByRole('listitem', { name: 'Opted out' }).getByRole('button', { name: 'Stop messages' }).click()
  await expect(page.getByRole('listitem', { name: 'Opted out' }).getByText('Stopped')).toBeVisible()

  await openPublish(page)
  await page.getByRole('radio', { name: /WhatsApp/ }).check()
  await page.getByLabel('Approved message template').selectOption({ label: 'festival_offer (en)' })
  await expect(page.getByLabel('Value for {{1}}')).not.toHaveValue('')
  // Customers who opted out are not offered.
  await expect(page.getByRole('checkbox', { name: /Opted out/ })).toHaveCount(0)
  await page.getByRole('checkbox', { name: /Select all/ }).check()
  await expect(page.getByLabel('Preview').getByText(/Hello! /)).toBeVisible()
  await page.getByRole('checkbox', { name: /I checked this post/ }).check()
  await page.getByRole('button', { name: 'Send now' }).click()
  await page.waitForURL(/\/dashboard\/publishing\?job=/)
  const jobId = new URL(page.url()).searchParams.get('job')!
  await expect(page.locator(`#job-${jobId}`).getByText('1 sent · 0 delivered · 0 read · 1 failed')).toBeVisible()

  // Meta status webhook (signed with the app secret) and a STOP reply from Ravi.
  const { messages } = await rows()
  const wamid = messages.find((m) => m.wamid)!.wamid!
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '100000000000001', changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '100000000000002' },
      statuses: [{ id: wamid, status: 'delivered', timestamp: '1', recipient_id: '919876543210' }],
      messages: [{ from: '919876543210', type: 'text', text: { body: 'STOP' } }],
    } }] }],
  })
  const signature = `sha256=${createHmac('sha256', metaAppSecret).update(body).digest('hex')}`
  const send = (sig: string) => request.post('/api/webhooks/meta', { data: Buffer.from(body), headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig } })
  expect((await send('sha256=' + '0'.repeat(64))).status()).toBe(401)
  expect((await send(signature)).status()).toBe(200)
  expect((await send(signature)).status()).toBe(200) // duplicate delivery
  const after = await rows()
  expect(after.messages.find((m) => m.wamid === wamid)!.status).toBe('DELIVERED')
  expect(after.contacts.find((c) => c.name === 'Ravi')!.opted_out_by).toBe('customer')
  await page.reload()
  await expect(page.locator(`#job-${jobId}`).getByText('1 sent · 1 delivered · 0 read · 1 failed')).toBeVisible()
  expect(errors).toEqual([])
})

test('security: other owners see nothing; the browser cannot publish, read tokens or run the scheduler', async ({ page, request }) => {
  const b = await apiClientFor(users.b)
  const [accounts, jobs, creds] = await Promise.all([
    b.client.from('social_accounts').select('id'),
    b.client.from('publishing_jobs').select('id'),
    b.client.from('social_account_credentials' as never).select('*'),
  ])
  expect(accounts.data).toEqual([])
  expect(jobs.data).toEqual([])
  expect(creds.error).not.toBeNull()

  const a = await apiClientFor(users.a)
  const { data: own } = await a.client.from('publishing_jobs').select('id').limit(1)
  // Owner A cannot forge a publication or change a job directly.
  const forged = await a.client.from('publishing_jobs').update({ status: 'PUBLISHED' } as never).eq('id', own![0].id).select('id')
  expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).not.toBeNull()
  const { data: account } = await a.client.from('social_accounts').select('id').limit(1).single()
  const noSecret = await a.client.rpc('publishing_create_job', {
    p_secret: 'not-the-secret-not-the-secret-not-the', p_content_id: ids.content, p_account_id: account!.id, p_scheduled_for: null,
    p_caption: 'x', p_media_asset_id: null, p_media_url: 'https://evil.example/x.jpg', p_media_path: null, p_payload: {}, p_metadata: {}, p_allow_repeat: true,
  })
  expect(noSecret.error?.message).toContain('publishing:forbidden')
  const read = await a.client.rpc('publishing_get_credentials', { p_secret: 'guess-guess-guess-guess-guess-guess-1', p_account_id: account!.id })
  expect(read.error).not.toBeNull()

  // Scheduler endpoint: secret required.
  expect((await request.post('/api/publishing/run')).status()).toBe(401)
  expect((await request.post('/api/publishing/run', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401)

  // Owner B cannot open owner A's publish page.
  await login(page, users.b)
  await page.goto(`/dashboard/content/${ids.content}/publish`)
  await expect(page.getByRole('heading', { name: 'Content not found' })).toBeVisible()
  await expect(page.getByText('Diwali rice offer')).toHaveCount(0)
})

test('disconnect cancels scheduled posts; pages fit a phone screen', async ({ page }) => {
  await login(page, users.a)
  const jobId = await publishTo(page, /Instagram/, { schedule: istIn(120), repeat: true })
  await expect(page.locator(`#job-${jobId}`).getByText('Scheduled', { exact: true })).toBeVisible()
  for (const path of ['/dashboard/publishing', `/dashboard/content/${ids.content}/publish`, '/dashboard/accounts', '/dashboard/accounts/whatsapp']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  }

  await page.goto('/dashboard/accounts')
  const ig = card(page, 'Facebook & Instagram').getByRole('listitem').filter({ hasText: '@mock_shop' })
  await ig.getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByText('Account disconnected.')).toBeVisible()
  await expect(card(page, 'Facebook & Instagram').getByText('@mock_shop', { exact: true })).toHaveCount(0)
  const r = await rows()
  expect(r.accounts.find((a) => a.channel === 'INSTAGRAM')!.status).toBe('DISCONNECTED')
  expect(r.jobs.find((j) => j.id === jobId)!.status).toBe('CANCELLED')
})
