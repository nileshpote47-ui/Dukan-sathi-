import 'server-only'
import { STOCK_IMAGE_HOSTS, STOCK_PER_PAGE, STOCK_TIMEOUT_MS } from '@/lib/config/stock'
import { StockError, type StockProvider, type StockSearchResult } from '../types'

/*
 * Pixabay (royalty-free photos, commercial use allowed). Plain HTTPS, no SDK. The key is a query
 * parameter, so request URLs are never logged. A chosen photo is downloaded by the owner's browser (allowed by Pixabay's CORS)
 * and uploaded to our storage; it is never hotlinked.
 */
const API = 'https://pixabay.com/api/'

interface Hit {
  id: number
  previewURL?: string
  webformatURL?: string
  largeImageURL?: string
  imageWidth?: number
  imageHeight?: number
  user?: string
  pageURL?: string
}

export class PixabayStockProvider implements StockProvider {
  readonly id = 'pixabay'

  constructor(private readonly options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {}

  private async call(params: Record<string, string>): Promise<{ hits: Hit[]; totalHits: number }> {
    if (!this.options.apiKey) throw new StockError('not_configured', 'PIXABAY_API_KEY is not set')
    const url = new URL(API)
    url.search = new URLSearchParams({ key: this.options.apiKey, image_type: 'photo', safesearch: 'true', lang: 'en', ...params }).toString()
    let response: Response
    try {
      response = await (this.options.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(STOCK_TIMEOUT_MS), cache: 'no-store' })
    } catch (error) {
      throw new StockError('unavailable', 'Pixabay request failed', { cause: error })
    }
    if (response.status === 429) throw new StockError('rate_limited', 'Pixabay rate limit')
    if (response.status === 400 && params.id) throw new StockError('not_found', 'Pixabay photo not found')
    if (response.status === 401 || response.status === 403) throw new StockError('not_configured', `Pixabay key refused (${response.status})`)
    if (!response.ok) throw new StockError('unavailable', `Pixabay error ${response.status}`)
    try {
      const data = (await response.json()) as { hits?: Hit[]; totalHits?: number }
      return { hits: Array.isArray(data.hits) ? data.hits : [], totalHits: Number(data.totalHits) || 0 }
    } catch (error) {
      throw new StockError('invalid_response', 'Pixabay returned invalid JSON', { cause: error })
    }
  }

  async search(query: string, page: number): Promise<StockSearchResult> {
    const { hits, totalHits } = await this.call({ q: query, page: String(page), per_page: String(STOCK_PER_PAGE) })
    return {
      total: totalHits,
      photos: hits
        .filter((h) => h.previewURL && allowedHost(h.previewURL))
        .map((h) => ({
          id: String(h.id),
          previewUrl: h.webformatURL && allowedHost(h.webformatURL) ? h.webformatURL : h.previewURL!,
          width: h.imageWidth ?? 0,
          height: h.imageHeight ?? 0,
          photographer: (h.user ?? '').slice(0, 80),
          pageUrl: h.pageURL && allowedHost(h.pageURL) ? h.pageURL : 'https://pixabay.com/',
          downloadUrl: [h.largeImageURL, h.webformatURL, h.previewURL].find((u) => u && allowedHost(u))!,
        })),
    }
  }

  async lookup(id: string) {
    if (!/^\d{1,12}$/.test(id)) throw new StockError('not_found', 'Bad photo id')
    const hit = (await this.call({ id })).hits[0]
    if (!hit) throw new StockError('not_found', 'Pixabay photo not found')
    return { photographer: (hit.user ?? '').slice(0, 80), pageUrl: hit.pageURL && allowedHost(hit.pageURL) ? hit.pageURL : 'https://pixabay.com/' }
  }
}

/** Only https URLs on Pixabay's own hosts are fetched or shown. */
export function allowedHost(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (STOCK_IMAGE_HOSTS as readonly string[]).includes(url.hostname)
  } catch {
    return false
  }
}
