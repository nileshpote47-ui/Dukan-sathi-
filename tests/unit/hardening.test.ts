import { describe, expect, it } from 'vitest'
import { FEATURE_KEYS } from '@/lib/config/billing'
import { RATE_LIMITS } from '@/lib/config/rate-limits'
import { publicSiteUrl, PUBLIC_ROUTES, SITEMAP_ROUTES } from '@/lib/config/site'
import { formatLogEntry, redact } from '@/lib/observability/log'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

describe('structured logs never carry secrets', () => {
  it('redacts credential-like fields at any depth', () => {
    const out = redact({
      code: 'PGRST301',
      accessToken: 'EAAB123',
      nested: { refresh_token: 'r', client_secret: 's', password: 'p', authorization: 'Bearer x', apiKey: 'k', ciphertext: 'c' },
      list: [{ signature: 'sig' }],
    }) as Record<string, unknown>
    expect(out.code).toBe('PGRST301')
    expect(out.accessToken).toBe('[redacted]')
    expect(Object.values(out.nested as object).every((value) => value === '[redacted]')).toBe(true)
    expect((out.list as Record<string, unknown>[])[0].signature).toBe('[redacted]')
  })

  it('masks bearer tokens and token query values inside text', () => {
    const text = redact('GET https://graph.facebook.com/me?access_token=EAABsecret&fields=id failed; Authorization: Bearer abc.def') as string
    expect(text).not.toContain('EAABsecret')
    expect(text).not.toContain('abc.def')
    expect(text).toContain('access_token=[redacted]')
  })

  it('keeps only name and message of errors, and cuts long text', () => {
    const error = new Error(`boom ${'x'.repeat(2000)}`)
    const out = redact(error) as { name: string; message: string; stack?: string }
    expect(out.name).toBe('Error')
    expect(out.message.length).toBeLessThanOrEqual(501)
    expect(out.stack).toBeUndefined()
  })

  it('writes one JSON line with level, message and time', () => {
    const line = formatLogEntry('error', '[billing] commit failed', [{ code: '23505', token: 't' }], new Date('2026-11-19T00:00:00Z'))
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ level: 'error', msg: '[billing] commit failed', time: '2026-11-19T00:00:00.000Z', details: { code: '23505', token: '[redacted]' } })
    expect(line).not.toContain('\n')
  })

  it('does not loop on deep or circular-looking structures', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } }
    expect(JSON.stringify(redact(deep))).toContain('[nested]')
  })
})

describe('rate limits', () => {
  it('cover every metered feature plus social connections, with sane windows', () => {
    for (const feature of FEATURE_KEYS) expect(RATE_LIMITS).toHaveProperty(feature)
    expect(RATE_LIMITS).toHaveProperty('social_connect')
    for (const [action, { limit, windowSeconds }] of Object.entries(RATE_LIMITS)) {
      expect(action).toMatch(/^[a-z_]{1,40}$/) // database check constraint
      expect(limit).toBeGreaterThanOrEqual(5)
      expect(limit).toBeLessThanOrEqual(10000)
      expect(windowSeconds).toBeGreaterThanOrEqual(60)
      expect(windowSeconds).toBeLessThanOrEqual(86400)
    }
  })
})

describe('public routes, robots and sitemap', () => {
  it('health check is public; private areas are not in the sitemap and are disallowed', () => {
    expect(PUBLIC_ROUTES).toContain('/api/health')
    // Called by the scheduler without a session (the route checks the server secret itself).
    expect(PUBLIC_ROUTES).toEqual(expect.arrayContaining(['/api/publishing/run', '/api/autopilot/run']))
    const rules = robots().rules as { disallow: string[] }
    for (const path of ['/dashboard', '/admin', '/onboarding', '/api/']) expect(rules.disallow).toContain(path)
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toHaveLength(SITEMAP_ROUTES.length)
    expect(urls.some((url) => /dashboard|admin|onboarding|api/.test(url))).toBe(false)
    expect(urls.every((url) => url.startsWith(publicSiteUrl()))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
import { quickCreateFormInput, titleFromBrief, QUICK_TITLE_MAX } from '@/lib/content/quick-title'
import { QUICK_CREATE_EXAMPLES, QUICK_CREATE_TYPES } from '@/lib/config/content'
import { DASHBOARD_NAV, NAV_GROUPS } from '@/lib/config/navigation'
import { LANGUAGES } from '@/lib/config/languages'
import { contentFormSchema, quickCreateSchema } from '@/lib/validation/content'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'

describe('dashboard composer', () => {
  it('titles a draft with the first clause of the owner’s own words', () => {
    expect(titleFromBrief('दिवाळीसाठी सर्व सुक्या मेव्यावर 20% सूट, काजू ₹899/किलो')).toBe('दिवाळीसाठी सर्व सुक्या मेव्यावर 20% सूट')
    expect(titleFromBrief('  New stock arrived: fresh rice ')).toBe('New stock arrived')
    expect(titleFromBrief('Hi, fresh vegetables daily')).toBe('Hi')
    const long = titleFromBrief('word '.repeat(60))
    expect(long.length).toBeLessThanOrEqual(QUICK_TITLE_MAX)
    expect(long.endsWith('…')).toBe(true)
  })

  it('builds a content form input the server accepts for every composer type and language', () => {
    for (const type of QUICK_CREATE_TYPES)
      for (const lang of LANGUAGES) {
        const parsed = contentFormSchema.safeParse(quickCreateFormInput('20% off all dry fruits for Diwali, cashews ₹899/kg', type, lang.code))
        expect(parsed.success).toBe(true)
        expect(parsed.data?.description).toBe('20% off all dry fruits for Diwali, cashews ₹899/kg')
      }
  })

  it('accepts only real sentences, allowed types and languages; ignores owner ids from the client', () => {
    expect(quickCreateSchema.safeParse({ brief: 'abc', content_type: 'POST', language: 'mr' }).success).toBe(false)
    expect(quickCreateSchema.safeParse({ brief: 'Fresh rice today', content_type: 'OTHER', language: 'mr' }).success).toBe(false)
    expect(quickCreateSchema.safeParse({ brief: 'Fresh rice today', content_type: 'POST', language: 'xx' }).success).toBe(false)
    const ok = quickCreateSchema.safeParse({ brief: 'Fresh rice today', content_type: 'OFFER', language: 'hi', owner_id: 'evil' })
    expect(ok.success && !('owner_id' in ok.data)).toBe(true)
  })

  it('every example, type and language card is translated in English, Marathi and Hindi', () => {
    for (const { key, type } of QUICK_CREATE_EXAMPLES) {
      expect(QUICK_CREATE_TYPES).toContain(type)
      for (const dict of [en, mr, hi] as Record<string, string>[]) {
        expect(dict[`composer.example.${key}`]).toBeTruthy()
        expect(dict[`composer.chip.${key}`]).toBeTruthy()
      }
    }
    for (const lang of LANGUAGES) expect(lang.sample.length).toBeGreaterThan(3)
  })

  it('navigation groups cover every item, in order, with labels', () => {
    for (const item of DASHBOARD_NAV) expect(NAV_GROUPS).toContain(item.group)
    const order = DASHBOARD_NAV.map((item) => NAV_GROUPS.indexOf(item.group))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const group of NAV_GROUPS.filter((g) => g !== 'home')) expect((en as Record<string, string>)[`nav.group.${group}`]).toBeTruthy()
  })
})
