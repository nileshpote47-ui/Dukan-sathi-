/**
 * Stock photo boundary (Phase 9, Stage 3b). The app depends only on these types; the vendor
 * lives in services/stock/providers/* and never reaches pages or components.
 */
export interface StockPhoto {
  /** Provider's photo id (digits). */
  id: string
  /** Small preview for the search grid (temporary display only, as the provider allows). */
  previewUrl: string
  width: number
  height: number
  /** Photographer name, shown with the photo. */
  photographer: string
  /** The photo's page on the provider's site. */
  pageUrl: string
}

export interface StockSearchResult {
  photos: StockPhoto[]
  total: number
}

export interface StockProvider {
  readonly id: string
  search(query: string, page: number): Promise<StockSearchResult>
  /** Look a photo up again BY ID (never trust a URL from the browser) and download it. */
  download(id: string): Promise<{ bytes: Uint8Array; photographer: string; pageUrl: string }>
}

export class StockError extends Error {
  constructor(
    readonly code: 'not_configured' | 'rate_limited' | 'not_found' | 'unavailable' | 'invalid_response',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'StockError'
  }
}
