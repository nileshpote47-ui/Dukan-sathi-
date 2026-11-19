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
    const rules = robots().rules as { disallow: string[] }
    for (const path of ['/dashboard', '/admin', '/onboarding', '/api/']) expect(rules.disallow).toContain(path)
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toHaveLength(SITEMAP_ROUTES.length)
    expect(urls.some((url) => /dashboard|admin|onboarding|api/.test(url))).toBe(false)
    expect(urls.every((url) => url.startsWith(publicSiteUrl()))).toBe(true)
  })
})
