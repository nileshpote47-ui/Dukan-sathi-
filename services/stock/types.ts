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
  /** Larger version the owner's browser downloads when they pick the photo (CORS allowed by the provider). */
  downloadUrl: string
}

export interface StockSearchResult {
  photos: StockPhoto[]
  total: number
}

export interface StockProvider {
  readonly id: string
  search(query: string, page: number): Promise<StockSearchResult>
  /**
   * Look a photo up again BY ID to confirm it exists and get its credits. The picture itself is downloaded by the
   * owner's browser (the provider refuses server downloads from shared hosting addresses) and checked by content.
   */
  lookup(id: string): Promise<{ photographer: string; pageUrl: string }>
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
