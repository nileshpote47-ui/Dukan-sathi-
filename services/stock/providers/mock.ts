import { mockPng } from '@/services/media/providers/mock'
import { StockError, type StockProvider, type StockSearchResult } from '../types'

/** Deterministic stock provider for automated tests (STOCK_PROVIDER=mock). No network. "fail" searches fail; id 999999 does not exist. */
export class MockStockProvider implements StockProvider {
  readonly id = 'mock'

  async search(query: string, page: number): Promise<StockSearchResult> {
    if (query.includes('fail')) throw new StockError('unavailable', 'Mock stock failure')
    const photos = Array.from({ length: 6 }, (_, i) => {
      const id = String(1000 + (page - 1) * 6 + i)
      const png = `data:image/png;base64,${Buffer.from(mockPng(320, 240, Number(id))).toString('base64')}`
      return { id, previewUrl: png, downloadUrl: png, width: 800, height: 600, photographer: `Mock Photographer ${i + 1}`, pageUrl: 'https://pixabay.com/' }
    })
    return { photos, total: 12 }
  }

  async lookup(id: string) {
    if (!/^\d{1,12}$/.test(id) || id === '999999') throw new StockError('not_found', 'Bad photo id')
    return { photographer: 'Mock Photographer', pageUrl: 'https://pixabay.com/' }
  }
}
