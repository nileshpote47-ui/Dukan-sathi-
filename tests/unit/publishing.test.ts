import { createHmac, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNEL_RULES, isRetryableError } from '@/lib/config/publishing'
import { countHashtags, defaultCaption, fillTemplate, isScheduledLater, validateDraft } from '@/lib/publishing/compose'
import { contactInputSchema, normalizePhone, publishInputSchema } from '@/lib/validation/publishing'
import { createOAuthState, readOAuthState } from '@/services/publishing/connect'
import { decryptCredentials, encryptCredentials } from '@/services/publishing/crypto'
import { mapGoogleError } from '@/services/publishing/providers/google'
import { MetaConnector } from '@/services/publishing/providers/meta'
import { mapGraphError, parseSignedRequest, parseWhatsAppWebhook, verifyHubSignature } from '@/services/publishing/providers/meta-shared'
import { WhatsAppConnector, countPositionalParams, usableTemplates } from '@/services/publishing/providers/whatsapp'
import type { PublishRequest } from '@/services/publishing/types'

const SECRET = 'unit-test-server-secret-0123456789abcdef'

describe('token encryption', () => {
  const key = randomBytes(32)

  it('round-trips credentials and never stores them in clear text', () => {
    const sealed = encryptCredentials({ accessToken: 'EAAG-secret-token', refreshToken: 'r1', expiresAt: null }, key)
    expect(sealed).not.toContain('EAAG-secret-token')
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(decryptCredentials(sealed, key)).toEqual({ accessToken: 'EAAG-secret-token', refreshToken: 'r1', expiresAt: null })
  })

  it('rejects a tampered value or the wrong key', () => {
    const sealed = encryptCredentials({ accessToken: 'abc' }, key)
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decryptCredentials(parts.join('.'), key)).toThrow()
    expect(() => decryptCredentials(sealed, randomBytes(32))).toThrow()
    expect(() => decryptCredentials('plain-token', key)).toThrow()
  })
})

describe('OAuth state', () => {
  it('accepts only the same connector, state and user before expiry', () => {
    const { cookie, state } = createOAuthState('meta', 'user-1', SECRET)
    expect(readOAuthState(cookie, { connector: 'meta', state, userId: 'user-1' }, SECRET)?.verifier).toBeTruthy()
    expect(readOAuthState(cookie, { connector: 'meta', state: 'other', userId: 'user-1' }, SECRET)).toBeNull()
    expect(readOAuthState(cookie, { connector: 'meta', state, userId: 'user-2' }, SECRET)).toBeNull()
    expect(readOAuthState(cookie, { connector: 'youtube', state, userId: 'user-1' }, SECRET)).toBeNull()
    expect(readOAuthState(cookie, { connector: 'meta', state, userId: 'user-1' }, 'another-secret-another-secret-123456')).toBeNull()
    expect(readOAuthState(`${cookie}x`, { connector: 'meta', state, userId: 'user-1' }, SECRET)).toBeNull()
    expect(readOAuthState(undefined, { connector: 'meta', state, userId: 'user-1' }, SECRET)).toBeNull()
  })

  it('expires after 10 minutes', () => {
    vi.useFakeTimers()
    const { cookie, state } = createOAuthState('google_business_profile', 'u', SECRET)
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(readOAuthState(cookie, { connector: 'google_business_profile', state, userId: 'u' }, SECRET)).toBeNull()
    vi.useRealTimers()
  })
})

describe('Meta error mapping', () => {
  it.each([
    [{ code: 190 }, 'AUTHORIZATION_EXPIRED', 'EXPIRED', null],
    [{ code: 190, error_subcode: 458 }, 'AUTHORIZATION_EXPIRED', 'REVOKED', null],
    [{ code: 10 }, 'PERMISSION_DENIED', null, null],
    [{ code: 200 }, 'PERMISSION_DENIED', null, null],
    [{ code: 4 }, 'RATE_LIMITED', null, 900],
    [{ code: 9, error_subcode: 2207042 }, 'RATE_LIMITED', null, 3600],
    [{ code: 36003, error_subcode: 2207009 }, 'INVALID_MEDIA', null, null],
    [{ code: 100 }, 'INVALID_CONTENT', null, null],
    [{ code: 2, is_transient: true }, 'PROVIDER_ERROR', null, 300],
  ])('%j → %s', (error, code, accountStatus, retry) => {
    const mapped = mapGraphError(error, 400)
    expect(mapped.code).toBe(code)
    expect(mapped.accountStatus ?? null).toBe(accountStatus)
    expect(mapped.retryInSeconds ?? null).toBe(retry)
  })

  it('treats an unparsable 5xx as a temporary provider error', () => {
    expect(mapGraphError(null, 502)).toMatchObject({ code: 'PROVIDER_ERROR', retryInSeconds: 300 })
  })
})

describe('Google error mapping', () => {
  it('maps status codes and never auto-retries a non-idempotent create except on 429', () => {
    expect(mapGoogleError(401, null)).toMatchObject({ code: 'AUTHORIZATION_EXPIRED', accountStatus: 'EXPIRED' })
    expect(mapGoogleError(403, { error: { message: 'API not enabled' } })).toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(mapGoogleError(429, null)).toMatchObject({ code: 'RATE_LIMITED', retryInSeconds: 900 })
    expect(mapGoogleError(400, null)).toMatchObject({ code: 'INVALID_CONTENT' })
    expect(mapGoogleError(503, null)).toMatchObject({ code: 'PROVIDER_ERROR', retryInSeconds: null })
  })
})

describe('Meta webhooks', () => {
  const appSecret = 'meta-app-secret'
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  const sign = (raw: string) => `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`

  it('verifies X-Hub-Signature-256 on the raw body', () => {
    expect(verifyHubSignature(body, sign(body), appSecret)).toBe(true)
    expect(verifyHubSignature(`${body} `, sign(body), appSecret)).toBe(false)
    expect(verifyHubSignature(body, sign(body).replace('sha256=', 'sha1='), appSecret)).toBe(false)
    expect(verifyHubSignature(body, null, appSecret)).toBe(false)
  })

  it('parses a signed_request (deauthorize / data deletion) and rejects forgeries', () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '12345', issued_at: 1 })).toString('base64url')
    const signature = createHmac('sha256', appSecret).update(payload).digest('base64url')
    expect(parseSignedRequest(`${signature}.${payload}`, appSecret)).toEqual({ user_id: '12345', issued_at: 1 })
    expect(parseSignedRequest(`${signature}.${payload}`, 'wrong')).toBeNull()
    expect(parseSignedRequest(`AAAA.${payload}`, appSecret)).toBeNull()
    expect(parseSignedRequest('garbage', appSecret)).toBeNull()
  })

  it('extracts message statuses and STOP replies, ignoring everything else', () => {
    const parsed = parseWhatsAppWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '106540352242922' },
                statuses: [
                  { id: 'wamid.1', status: 'delivered' },
                  { id: 'wamid.2', status: 'failed', errors: [{ code: 131049 }] },
                ],
                messages: [
                  { from: '919876543210', type: 'text', text: { body: 'STOP' } },
                  { from: '919876543211', type: 'button', button: { text: 'Stop promotions' } },
                  { from: '919876543212', type: 'text', text: { body: 'What is the price?' } },
                ],
              },
            },
            { field: 'account_update', value: {} },
          ],
        },
      ],
    })
    expect(parsed).toEqual([
      {
        phoneNumberId: '106540352242922',
        statuses: [
          { wamid: 'wamid.1', status: 'delivered', error_code: null },
          { wamid: 'wamid.2', status: 'failed', error_code: '131049' },
        ],
        optOuts: ['+919876543210', '+919876543211'],
      },
    ])
    expect(parseWhatsAppWebhook({ object: 'page', entry: [] })).toEqual([])
    expect(parseWhatsAppWebhook(null)).toEqual([])
  })
})

describe('WhatsApp templates', () => {
  it('counts positional parameters', () => {
    expect(countPositionalParams('Hi {{1}}, {{2}} off at {{ 3 }}')).toBe(3)
    expect(countPositionalParams('No params')).toBe(0)
  })

  it('keeps only approved MARKETING templates the app can fill', () => {
    const rows = [
      { name: 'offer', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi {{1}}' }] },
      { name: 'pending', language: 'en', status: 'PENDING', category: 'MARKETING', components: [{ type: 'BODY', text: 'x' }] },
      { name: 'utility', language: 'en', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'x' }] },
      { name: 'video', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'HEADER', format: 'VIDEO' }, { type: 'BODY', text: 'x' }] },
      { name: 'named', language: 'en', status: 'APPROVED', category: 'MARKETING', parameter_format: 'NAMED', components: [{ type: 'BODY', text: '{{name}}' }] },
      { name: 'url_var', language: 'en', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'x' }, { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://x.in/{{1}}' }] }] },
      { name: 'too_many', language: 'hi', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: '{{1}}{{2}}{{3}}{{4}}{{5}}{{6}}' }] },
    ]
    expect(usableTemplates(rows, 5).map((t) => t.name)).toEqual(['offer'])
    expect(usableTemplates(rows, 5)[0]).toMatchObject({ imageHeader: true, bodyParamCount: 1 })
  })

  it('fills the preview', () => {
    expect(fillTemplate('Hello {{1}}, {{2}}!', ['Ravi', ''])).toBe('Hello Ravi, {{2}}!')
  })
})

describe('channel validation', () => {
  const now = new Date('2026-11-19T10:00:00Z')
  const square = { width: 1080, height: 1080, mimeType: 'image/png' }
  const keys = (issues: { key: string }[]) => issues.map((i) => i.key)

  it('Instagram needs a picture in an accepted shape and respects caption limits', () => {
    expect(keys(validateDraft({ channel: 'INSTAGRAM', caption: 'Hi', media: null, scheduledFor: null, now }))).toContain('publishing.validation.needsImage')
    expect(keys(validateDraft({ channel: 'INSTAGRAM', caption: 'Hi', media: { width: 1080, height: 1920, mimeType: 'image/png' }, scheduledFor: null, now }))).toContain('publishing.validation.aspect')
    expect(validateDraft({ channel: 'INSTAGRAM', caption: 'Hi', media: { width: 1080, height: 1350, mimeType: 'image/png' }, scheduledFor: null, now })).toEqual([])
    expect(keys(validateDraft({ channel: 'INSTAGRAM', caption: 'x'.repeat(2201), media: square, scheduledFor: null, now }))).toContain('publishing.validation.captionTooLong')
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ')
    expect(countHashtags(tags)).toBe(31)
    expect(keys(validateDraft({ channel: 'INSTAGRAM', caption: tags, media: square, scheduledFor: null, now }))).toContain('publishing.validation.tooManyHashtags')
  })

  it('Facebook and Google Business Profile accept text without a picture', () => {
    expect(validateDraft({ channel: 'FACEBOOK', caption: 'Fresh stock today', media: null, scheduledFor: null, now })).toEqual([])
    expect(validateDraft({ channel: 'GOOGLE_BUSINESS_PROFILE', caption: 'Open on Sunday', media: null, scheduledFor: null, now })).toEqual([])
    expect(keys(validateDraft({ channel: 'GOOGLE_BUSINESS_PROFILE', caption: 'x'.repeat(1501), media: null, scheduledFor: null, now }))).toContain('publishing.validation.captionTooLong')
  })

  it('YouTube is refused until video export exists', () => {
    expect(keys(validateDraft({ channel: 'YOUTUBE', caption: 'x', media: square, scheduledFor: null, now }))).toEqual(['publishing.validation.needsVideo'])
  })

  it('schedules must be at least 5 minutes and at most 30 days ahead', () => {
    const base = { channel: 'FACEBOOK' as const, caption: 'x', media: null, now }
    expect(keys(validateDraft({ ...base, scheduledFor: new Date(now.getTime() + 60_000) }))).toContain('publishing.validation.scheduleTooSoon')
    expect(keys(validateDraft({ ...base, scheduledFor: new Date(now.getTime() + 31 * 86_400_000) }))).toContain('publishing.validation.scheduleTooFar')
    expect(validateDraft({ ...base, scheduledFor: new Date(now.getTime() + 3_600_000) })).toEqual([])
    expect(keys(validateDraft({ ...base, scheduledFor: new Date(NaN) }))).toContain('publishing.validation.scheduleTooSoon')
  })

  it('WhatsApp needs an approved template, every value, a picture for image templates and at most 50 recipients', () => {
    const wa = (over: object) => ({ templateChosen: true, params: ['a'], paramCount: 1, recipients: 1, needsImage: false, ...over })
    const draft = (whatsapp: object, media: typeof square | null = null) => validateDraft({ channel: 'WHATSAPP', caption: '', media, scheduledFor: null, now, whatsapp: wa(whatsapp) })
    expect(draft({})).toEqual([])
    expect(keys(draft({ templateChosen: false }))).toContain('publishing.validation.chooseTemplate')
    expect(keys(draft({ params: [''] }))).toContain('publishing.validation.fillParams')
    expect(keys(draft({ params: ['line\nbreak'] }))).toContain('publishing.validation.paramFormat')
    expect(keys(draft({ needsImage: true }))).toContain('publishing.validation.needsImage')
    expect(keys(draft({ recipients: 0 }))).toContain('publishing.validation.chooseRecipients')
    expect(keys(draft({ recipients: 51 }))).toContain('publishing.validation.tooManyRecipients')
  })

  it('builds captions from saved AI copy (hashtags only where they help) within limits', () => {
    const item = { title: 'Diwali', product_name: 'Sweets', offer_text: '10% off', description: null, call_to_action: null, price: null }
    const copy = { headline: 'Diwali sweets', primary_text: 'Fresh every day.', call_to_action: 'Visit today', hashtags: ['#Diwali', '#Pune'] }
    // The AI copy left out the owner's offer: it is added exactly as typed (product already present).
    expect(defaultCaption('INSTAGRAM', item, copy)).toBe('Diwali sweets\n\nFresh every day.\n\n🎁 10% off\n\nVisit today\n\n#Diwali #Pune')
    // Already in the AI text: not repeated.
    expect(defaultCaption('FACEBOOK', item, { ...copy, primary_text: 'Fresh every day, now 10% OFF.' })).not.toContain('🎁')
    // Every owner fact missing from the AI text comes back, in a fixed order, and the owner's own CTA is used when the AI gave none.
    const full = { ...item, product_name: 'Kaju katli', price: '₹800/kg', call_to_action: 'Call 98765' }
    expect(defaultCaption('FACEBOOK', full, { headline: 'Diwali special', primary_text: 'Fresh sweets.' })).toBe(
      'Diwali special\n\nFresh sweets.\n\n🛍️ Kaju katli\n🎁 10% off\n💰 ₹800/kg\n\nCall 98765',
    )
    expect(defaultCaption('GOOGLE_BUSINESS_PROFILE', item, copy)).not.toContain('#Diwali')
    expect(defaultCaption('FACEBOOK', item, null)).toBe('Sweets\n\n10% off')
    expect(defaultCaption('GOOGLE_BUSINESS_PROFILE', { ...item, description: 'x'.repeat(3000) }, null).length).toBe(CHANNEL_RULES.GOOGLE_BUSINESS_PROFILE.maxCaption)
  })

  it('shows a queued job with a future time as scheduled', () => {
    const now2 = Date.parse('2026-11-19T10:00:00Z')
    expect(isScheduledLater('QUEUED', '2026-11-19T11:00:00Z', now2)).toBe(true)
    expect(isScheduledLater('QUEUED', '2026-11-19T09:00:00Z', now2)).toBe(false)
    expect(isScheduledLater('PUBLISHED', '2026-11-19T11:00:00Z', now2)).toBe(false)
  })

  it('retry rule mirrors the database', () => {
    expect(isRetryableError('RATE_LIMITED')).toBe(true)
    expect(isRetryableError('AUTHORIZATION_EXPIRED')).toBe(true)
    expect(isRetryableError('INVALID_MEDIA')).toBe(false)
    expect(isRetryableError('INVALID_CONTENT')).toBe(false)
  })
})

describe('input validation', () => {
  it('normalises Indian and international phone numbers', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210')
    expect(normalizePhone('09876543210')).toBe('+919876543210')
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210')
    expect(normalizePhone('+447700900123')).toBe('+447700900123')
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('5876543210')).toBeNull()
  })

  it('requires the customer’s consent and a known opt-in source', () => {
    const base = { name: 'Ravi', phone: '9876543210', optInSource: 'in_person', consent: true }
    expect(contactInputSchema.safeParse(base).success).toBe(true)
    expect(contactInputSchema.safeParse({ ...base, consent: false }).success).toBe(false)
    expect(contactInputSchema.safeParse({ ...base, optInSource: 'bought_list' }).success).toBe(false)
  })

  it('publishing needs an explicit confirmation and ids, never an owner', () => {
    const base = { contentId: crypto.randomUUID(), accountId: crypto.randomUUID(), caption: 'x', mode: 'now', confirm: true }
    expect(publishInputSchema.safeParse(base).success).toBe(true)
    expect(publishInputSchema.safeParse({ ...base, confirm: false }).success).toBe(false)
    expect(publishInputSchema.safeParse({ ...base, accountId: 'not-a-uuid' }).success).toBe(false)
    expect(publishInputSchema.parse({ ...base, owner_id: 'x' })).not.toHaveProperty('owner_id')
    const many = Array.from({ length: 51 }, () => crypto.randomUUID())
    expect(publishInputSchema.safeParse({ ...base, whatsapp: { templateName: 'a', language: 'en', params: [], contactIds: many } }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Provider adapters against a stubbed fetch (no real API calls)
// ---------------------------------------------------------------------------

type Route = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | Promise<never>

function stubFetch(route: Route) {
  const calls: { url: URL; init: RequestInit }[] = []
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input)
    calls.push({ url, init })
    const result = await route(url, init)
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), { status: result.status ?? 200 })
  })
  return calls
}

const request = (over: Partial<PublishRequest> = {}): PublishRequest => ({
  target: { accountId: 'acc', channel: 'INSTAGRAM', externalId: 'ig_1', parentId: 'page_1', metadata: {} },
  credentials: { accessToken: 'page-token' },
  caption: 'Diwali offer',
  mediaUrl: 'https://storage.example/signed.jpg',
  previousRef: null,
  ...over,
})

describe('Meta adapter', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_ID', '123')
    vi.stubEnv('META_APP_SECRET', 'app-secret')
    vi.stubEnv('META_LOGIN_CONFIG_ID', '456')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('publishes an Instagram picture: container → ready → publish → permalink (token in header, appsecret_proof sent)', async () => {
    const calls = stubFetch((url) => {
      if (url.pathname.endsWith('/ig_1/media')) return { body: { id: 'container_1' } }
      if (url.pathname.endsWith('/container_1')) return { body: { status_code: 'FINISHED' } }
      if (url.pathname.endsWith('/ig_1/media_publish')) return { body: { id: 'media_9' } }
      if (url.pathname.endsWith('/media_9')) return { body: { permalink: 'https://www.instagram.com/p/abc/' } }
      return { status: 404, body: {} }
    })
    const result = await new MetaConnector().publish(request())
    expect(result).toMatchObject({ ok: true, externalId: 'media_9', externalUrl: 'https://www.instagram.com/p/abc/', providerRef: 'container_1' })
    for (const call of calls) {
      expect(call.url.toString()).not.toContain('page-token')
      expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer page-token')
    }
    expect(calls[0].init.body?.toString()).toContain('appsecret_proof=')
    expect(calls[0].init.body?.toString()).toContain('image_url=')
  })

  it('a retry never publishes twice: an already published container is reported as success', async () => {
    const calls = stubFetch((url) => (url.pathname.endsWith('/container_1') ? { body: { status_code: 'PUBLISHED' } } : { status: 500, body: {} }))
    const result = await new MetaConnector().publish(request({ previousRef: 'container_1' }))
    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.url.pathname.endsWith('/media') || c.url.pathname.endsWith('/media_publish'))).toBe(false)
  })

  it('an expired token marks the account for reconnection', async () => {
    stubFetch(() => ({ status: 400, body: { error: { code: 190, message: 'Error validating access token' } } }))
    const result = await new MetaConnector().publish(request({ target: { accountId: 'a', channel: 'FACEBOOK', externalId: 'page_1', parentId: null, metadata: {} } }))
    expect(result).toMatchObject({ ok: false, code: 'AUTHORIZATION_EXPIRED', accountStatus: 'EXPIRED' })
  })

  it('a malformed success response is not treated as published', async () => {
    stubFetch(() => ({ status: 200, body: { unexpected: true } }))
    const result = await new MetaConnector().publish(request({ target: { accountId: 'a', channel: 'FACEBOOK', externalId: 'page_1', parentId: null, metadata: {} } }))
    expect(result.ok).toBe(false)
  })

  it('a timeout is reported as unknown and never retried automatically', async () => {
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    })
    const result = await new MetaConnector().publish(request({ target: { accountId: 'a', channel: 'FACEBOOK', externalId: 'page_1', parentId: null, metadata: {} } }))
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_ERROR', retryInSeconds: null })
  })

  it('a rate limit on a Facebook photo is retried later; other rejections are not', async () => {
    stubFetch(() => ({ status: 400, body: { error: { code: 4, message: 'Application request limit reached' } } }))
    const target = { accountId: 'a', channel: 'FACEBOOK' as const, externalId: 'page_1', parentId: null, metadata: {} }
    expect(await new MetaConnector().publish(request({ target }))).toMatchObject({ ok: false, code: 'RATE_LIMITED', retryInSeconds: 900 })
    stubFetch(() => ({ status: 400, body: { error: { code: 1, message: 'Unknown error' } } }))
    expect(await new MetaConnector().publish(request({ target }))).toMatchObject({ ok: false, code: 'PROVIDER_ERROR', retryInSeconds: null })
  })
})

describe('WhatsApp adapter', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_ID', '123')
    vi.stubEnv('META_APP_SECRET', 'app-secret')
    vi.stubEnv('META_WHATSAPP_CONFIG_ID', '789')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const waRequest = (recipients: { contactId: string; phone: string }[]): PublishRequest =>
    request({
      target: { accountId: 'a', channel: 'WHATSAPP', externalId: 'phone_1', parentId: 'waba_1', metadata: {} },
      whatsapp: { template: { name: 'festival_offer', language: 'en', bodyParams: ['10% off', 'Shirur'], imageHeader: true }, recipients },
    })

  it('sends one Marketing Messages API template per opted-in recipient and records each result', async () => {
    const bodies: unknown[] = []
    stubFetch((url, init) => {
      expect(url.pathname).toMatch(/\/phone_1\/marketing_messages$/)
      bodies.push(JSON.parse(String(init.body)))
      const to = (JSON.parse(String(init.body)) as { to: string }).to
      return to.endsWith('0000') ? { status: 400, body: { error: { code: 131026, message: 'Receiver incapable' } } } : { body: { messages: [{ id: `wamid.${to}` }] } }
    })
    const result = await new WhatsAppConnector().publish(waRequest([{ contactId: 'c1', phone: '+919876543210' }, { contactId: 'c2', phone: '+919876540000' }]))
    expect(result).toMatchObject({ ok: true, metadata: { recipients: 2, accepted: 1, rejected: 1 } })
    expect(result.messages).toEqual([
      { contactId: 'c1', wamid: 'wamid.919876543210' },
      { contactId: 'c2', wamid: null, errorCode: '131026' },
    ])
    expect(bodies[0]).toMatchObject({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: { name: 'festival_offer', components: [{ type: 'header' }, { type: 'body', parameters: [{ text: '10% off' }, { text: 'Shirur' }] }] },
    })
  })

  it('stops at the first authorization error', async () => {
    const calls = stubFetch(() => ({ status: 401, body: { error: { code: 190, message: 'expired' } } }))
    const result = await new WhatsAppConnector().publish(waRequest([{ contactId: 'c1', phone: '+919876543210' }, { contactId: 'c2', phone: '+919876543211' }]))
    expect(result).toMatchObject({ ok: false, code: 'AUTHORIZATION_EXPIRED', accountStatus: 'EXPIRED' })
    expect(calls).toHaveLength(1)
  })

  it('refuses to send without recipients or without the template picture', async () => {
    expect(await new WhatsAppConnector().publish(waRequest([]))).toMatchObject({ ok: false, code: 'INVALID_CONTENT' })
    expect(await new WhatsAppConnector().publish({ ...waRequest([{ contactId: 'c', phone: '+919876543210' }]), mediaUrl: null })).toMatchObject({ ok: false, code: 'INVALID_MEDIA' })
  })
})
