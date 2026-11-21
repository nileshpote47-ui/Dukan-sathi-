import sharp from 'sharp'
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_MESSAGES } from '@/lib/config/billing'
import { en } from '@/lib/i18n/messages/en'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPosterLayout } from '@/lib/config/poster-templates'
import { padToAspect } from '@/lib/media/fit-aspect'
import { needsReview } from '@/lib/services/publishing'
import { directPosterSchema } from '@/lib/validation/media'
import type { MarketingContext } from '@/services/ai/types'
import { buildDirectPosterPrompt, buildImagePrompt, directPosterLines } from '@/services/media/prompts'
import { getDirectPosterConfig } from '@/services/media/provider'
import { mockPng } from '@/services/media/providers/mock'
import { openAIError, OpenAIImageProvider } from '@/services/media/providers/openai'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

const context: MarketingContext = { business: { name: 'Shree Ganesh Kirana', category: 'grocery', location: 'Shirur, Pune' }, preferences: { language: 'mr' } }
const texts = {
  headline: 'दिवाळी धमाका ऑफर',
  body: 'सर्व सुक्या मेव्यावर 20% सूट\nकाजू ₹899/किलो',
  badge: '₹899/किलो',
  cta: 'आजच भेट द्या!',
  businessName: 'श्री गणेश किराणा',
  footer: '',
}

afterEach(() => vi.unstubAllEnvs())

describe('direct poster prompt', () => {
  it('carries every owner line word for word, one per line, and nothing for empty fields', () => {
    const prompt = buildDirectPosterPrompt({ context, item: { title: 'Diwali offer', product: 'Kaju' }, aspectRatio: '4:5', layout: getPosterLayout('festival-offer'), texts })
    for (const line of ['दिवाळी धमाका ऑफर', 'सर्व सुक्या मेव्यावर 20% सूट', 'काजू ₹899/किलो', 'आजच भेट द्या!', 'श्री गणेश किराणा']) expect(prompt).toContain(`"""${line}"""`)
    expect(directPosterLines(texts)).toHaveLength(6) // body split into two lines; empty footer left out
    expect(prompt).not.toContain('Place / phone')
    expect(prompt).toMatch(/write EXACTLY these lines and nothing else/)
    expect(prompt).toMatch(/Do not translate, shorten, correct or add words/)
  })

  it('keeps the visuals-only rule for ordinary AI pictures', () => {
    expect(buildImagePrompt({ context, item: { title: 'Kaju' }, purpose: 'poster', aspectRatio: '4:5' })).toMatch(/No words, letters, numbers, prices/)
  })

  it('validates input: owner lines with limits, known template and size', () => {
    const base = { content_id: '00000000-0000-4000-8000-000000000000', template: 'festival-offer', aspect_ratio: '4:5', texts }
    expect(directPosterSchema.safeParse(base).success).toBe(true)
    expect(directPosterSchema.safeParse({ ...base, template: 'evil' }).success).toBe(false)
    expect(directPosterSchema.safeParse({ ...base, aspect_ratio: '3:2' }).success).toBe(false)
    expect(directPosterSchema.safeParse({ ...base, texts: { ...texts, headline: '' } }).success).toBe(false)
  })
})

describe('direct poster provider (OpenAI)', () => {
  it('sends one request with the server key, the model and the native size, and returns the image bytes', async () => {
    const png = mockPng(8, 12)
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ model: 'gpt-image-2.6-sunburst', size: '1024x1536', n: 1 })
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString('base64') }] }), { status: 200 })
    })
    const provider = new OpenAIImageProvider('gpt-image-2.6-sunburst', { apiKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await provider.generateImage({ prompt: 'x', aspectRatio: '4:5' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(Buffer.from(result.bytes).equals(Buffer.from(png))).toBe(true)
  })

  it('maps errors to safe codes and never puts the key in the message', async () => {
    const fail = (status: number, body: unknown) => new OpenAIImageProvider('m', { apiKey: 'sk-secret', fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch })
    await expect(fail(429, { error: { code: 'rate_limit_exceeded' } }).generateImage({ prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'rate_limited' })
    await expect(fail(401, { error: { code: 'invalid_api_key' } }).generateImage({ prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'not_configured' })
    await expect(fail(200, { data: [] }).generateImage({ prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'empty_response' })
    expect(openAIError(400, JSON.stringify({ error: { code: 'moderation_blocked' } })).code).toBe('blocked')
    expect(openAIError(503, 'down').code).toBe('unavailable')
    expect(openAIError(401, JSON.stringify({ error: { message: 'sk-secret is wrong' } })).message).not.toContain('sk-secret')
    await expect(new OpenAIImageProvider('m', {}).generateImage({ prompt: 'x', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('is chosen from server-only settings; the test provider never runs in production', () => {
    vi.stubEnv('DIRECT_POSTER_PROVIDER', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(getDirectPosterConfig()).toBeNull()
    vi.stubEnv('OPENAI_API_KEY', 'k')
    expect(getDirectPosterConfig()).toEqual({ provider: 'openai', model: 'gpt-image-2.6-sunburst' })
    vi.stubEnv('DIRECT_POSTER_PROVIDER', 'mock')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(getDirectPosterConfig()).toBeNull()
  })
})

describe('fitting to a social size', () => {
  it('pads (never crops) a 2:3 image to 4:5 and 9:16, and a landscape one to 16:9', async () => {
    for (const [w, h, ratio, ew, eh] of [[1024, 1536, '4:5', 1080, 1350], [1024, 1536, '9:16', 1080, 1920], [1536, 1024, '16:9', 1920, 1080], [1024, 1024, '1:1', 1080, 1080]] as const) {
      const out = await padToAspect(mockPng(w, h), ratio)
      const meta = await sharp(out).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', ew, eh])
    }
  })
})

describe('publishing safety', () => {
  it('holds back a direct poster until the owner confirms it', () => {
    expect(needsReview({ kind: 'direct_poster', reviewed: false })).toBe(true)
    expect(needsReview({ kind: 'direct_poster' })).toBe(true)
    expect(needsReview({ kind: 'direct_poster', reviewed: true })).toBe(false)
    expect(needsReview({ template: 'simple' })).toBe(false)
    expect(needsReview(null)).toBe(false)
  })
})

describe('billing texts', () => {
  it('every metered feature has its plan line, label and limit message in English', () => {
    const dict = en as Record<string, string>
    for (const key of FEATURE_KEYS) {
      expect(dict[`billing.entitlement.${key}`], key).toContain('{n}')
      expect(dict[FEATURE_LABELS[key]], key).toBeTruthy()
      expect(dict[LIMIT_MESSAGES[key]], key).toBeTruthy()
    }
  })
})
