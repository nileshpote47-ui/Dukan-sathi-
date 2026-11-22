import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE_GROUPS } from '@/lib/config/category-examples'
import { MEDIA_SOURCE_TYPES } from '@/lib/config/media'
import { STOCK_SUGGESTIONS } from '@/lib/config/stock'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'
import { validateImage } from '@/lib/media/image-file'
import { stockSaveSchema, stockSearchSchema } from '@/lib/validation/stock'
import { getStockProviderId } from '@/services/stock/provider'
import { MockStockProvider } from '@/services/stock/providers/mock'
import { allowedHost, PixabayStockProvider } from '@/services/stock/providers/pixabay'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
afterEach(() => vi.unstubAllEnvs())

const hit = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  previewURL: `https://cdn.pixabay.com/photo/x/${id}_150.jpg`,
  webformatURL: `https://pixabay.com/get/${id}_640.jpg`,
  largeImageURL: `https://pixabay.com/get/${id}_1280.jpg`,
  imageWidth: 4000,
  imageHeight: 3000,
  user: 'Josch13',
  pageURL: `https://pixabay.com/photos/${id}/`,
  ...extra,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('Pixabay provider', () => {
  it('searches English photos, safe for all ages, with the key only in the request', async () => {
    const fetchImpl = vi.fn(async () => json({ totalHits: 2, hits: [hit(1), hit(2, { previewURL: 'https://evil.example/x.jpg' })] }))
    const result = await new PixabayStockProvider({ apiKey: 'k3y', fetchImpl }).search('dry fruits', 2)
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]))
    expect(url.origin + url.pathname).toBe('https://pixabay.com/api/')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ key: 'k3y', q: 'dry fruits', page: '2', image_type: 'photo', safesearch: 'true', lang: 'en' })
    // A result pointing outside Pixabay's own hosts is dropped.
    expect(result.photos).toHaveLength(1)
    expect(result.photos[0]).toMatchObject({ id: '1', previewUrl: 'https://pixabay.com/get/1_640.jpg', photographer: 'Josch13' })
    expect(result.total).toBe(2)
  })

  it('offers the large version for the browser to download, from Pixabay hosts only', async () => {
    const fetchImpl = vi.fn(async () => json({ totalHits: 1, hits: [hit(3), hit(4, { largeImageURL: 'http://169.254.169.254/x' })] }))
    const { photos } = await new PixabayStockProvider({ apiKey: 'k', fetchImpl }).search('rice', 1)
    expect(photos[0].downloadUrl).toBe('https://pixabay.com/get/3_1280.jpg')
    expect(photos[1].downloadUrl).toBe('https://pixabay.com/get/4_640.jpg') // unsafe large URL skipped
  })

  it('confirms a photo by id and takes the credits from Pixabay, not from the browser', async () => {
    const fetchImpl = vi.fn(async () => json({ hits: [hit(7)] }))
    const provider = new PixabayStockProvider({ apiKey: 'k', fetchImpl })
    expect(await provider.lookup('7')).toEqual({ photographer: 'Josch13', pageUrl: 'https://pixabay.com/photos/7/' })
    expect(new URL(String((fetchImpl.mock.calls[0] as unknown[])[0])).searchParams.get('id')).toBe('7')
    await expect(provider.lookup('7; drop')).rejects.toMatchObject({ code: 'not_found' })
    const missing = new PixabayStockProvider({ apiKey: 'k', fetchImpl: vi.fn(async () => json({ hits: [] })) })
    await expect(missing.lookup('8')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('maps errors without exposing the key', async () => {
    const limited = new PixabayStockProvider({ apiKey: 'secret', fetchImpl: vi.fn(async () => new Response('API rate limit exceeded', { status: 429 })) })
    await expect(limited.search('rice', 1)).rejects.toMatchObject({ code: 'rate_limited' })
    const refused = new PixabayStockProvider({ apiKey: 'secret', fetchImpl: vi.fn(async () => new Response('[ERROR 400] Invalid or missing API key', { status: 403 })) })
    const error = await refused.search('rice', 1).catch((e: Error) => e)
    expect(error).toMatchObject({ code: 'not_configured' })
    expect((error as Error).message).not.toContain('secret')
    await expect(new PixabayStockProvider().search('rice', 1)).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('allows only https Pixabay hosts', () => {
    expect(allowedHost('https://cdn.pixabay.com/a.jpg')).toBe(true)
    expect(allowedHost('https://pixabay.com/get/a.jpg')).toBe(true)
    expect(allowedHost('http://pixabay.com/get/a.jpg')).toBe(false)
    expect(allowedHost('https://pixabay.com.evil.example/a.jpg')).toBe(false)
    expect(allowedHost('not a url')).toBe(false)
  })
})

describe('provider selection, input and test provider', () => {
  it('is chosen from server-only settings; the test provider never runs in production', () => {
    vi.stubEnv('STOCK_PROVIDER', '')
    vi.stubEnv('PIXABAY_API_KEY', '')
    expect(getStockProviderId()).toBeNull()
    vi.stubEnv('PIXABAY_API_KEY', 'k')
    expect(getStockProviderId()).toBe('pixabay')
    vi.stubEnv('STOCK_PROVIDER', 'mock')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(getStockProviderId()).toBeNull()
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(getStockProviderId()).toBe('mock')
  })

  it('accepts only a search term, or a numeric photo id and the owner\'s content', () => {
    expect(stockSearchSchema.safeParse({ query: ' x ' }).success).toBe(false)
    expect(stockSearchSchema.parse({ query: ' cashew ' })).toEqual({ query: 'cashew', page: 1 })
    expect(stockSaveSchema.safeParse({ photo_id: 'https://pixabay.com/get/x.jpg' }).success).toBe(false)
    const saved = stockSaveSchema.parse({ photo_id: '195893', content_id: '', url: 'https://evil.example', owner_id: 'x' })
    expect(saved).toEqual({ photo_id: '195893', content_id: null })
  })

  it('mock photos are real images that pass the file check', async () => {
    const mock = new MockStockProvider()
    const { photos } = await mock.search('rice', 1)
    expect(photos).toHaveLength(6)
    const bytes = new Uint8Array(Buffer.from(photos[0].downloadUrl.split(',')[1], 'base64'))
    expect(validateImage(bytes).ok).toBe(true)
    await expect(mock.lookup('999999')).rejects.toMatchObject({ code: 'not_found' })
    await expect(mock.search('fail', 1)).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('stock texts and config', () => {
  it('has suggestions for every shop group, labelled in English, Marathi and Hindi', () => {
    expect(MEDIA_SOURCE_TYPES).toContain('STOCK')
    for (const group of EXAMPLE_GROUPS) {
      expect(STOCK_SUGGESTIONS[group].length).toBeGreaterThanOrEqual(3)
      for (const s of STOCK_SUGGESTIONS[group]) {
        expect(s.q).toMatch(/^[a-z ]{2,40}$/)
        for (const dict of [en, mr, hi] as Record<string, string>[]) expect(dict[`stock.suggest.${s.key}`], s.key).toBeTruthy()
      }
    }
    const keys = Object.keys(en).filter((k) => k.startsWith('stock.') && !k.startsWith('stock.suggest.'))
    for (const dict of [mr, hi] as Record<string, string>[]) for (const key of [...keys, 'media.source.STOCK', 'media.detail.photographer']) expect(dict[key], key).toBeTruthy()
  })
})
