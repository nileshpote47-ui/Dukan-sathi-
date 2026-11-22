import 'server-only'
import { unstable_cache } from 'next/cache'
import { STOCK_SEARCH_CACHE_SECONDS } from '@/lib/config/stock'
import { log } from '@/lib/observability/log'
import { getStockProvider, getStockProviderId } from './provider'
import { StockError, type StockSearchResult } from './types'

/*
 * The only entry points for stock photos. Searches are cached for 24 hours (provider rule) by
 * provider + query + page; the API key is never part of the cache key or the logs.
 */
const cachedSearch = unstable_cache(
  async (_provider: string, query: string, page: number): Promise<StockSearchResult> => getStockProvider().search(query, page),
  ['stock-search-v1'],
  { revalidate: STOCK_SEARCH_CACHE_SECONDS },
)

export async function searchStockPhotos(query: string, page: number): Promise<StockSearchResult> {
  const provider = getStockProviderId()
  if (!provider) throw new StockError('not_configured', 'Stock photos are not configured')
  try {
    return await cachedSearch(provider, query.trim().toLowerCase(), page)
  } catch (error) {
    log.error('[stock] search failed', { provider, code: error instanceof StockError ? error.code : 'unknown', reason: error instanceof Error ? error.message : 'unknown' })
    throw error instanceof StockError ? error : new StockError('unavailable', 'Stock search failed', { cause: error })
  }
}

export async function downloadStockPhoto(id: string) {
  const provider = getStockProvider()
  try {
    return { ...(await provider.download(id)), provider: provider.id }
  } catch (error) {
    log.error('[stock] download failed', { provider: provider.id, code: error instanceof StockError ? error.code : 'unknown', reason: error instanceof Error ? error.message : 'unknown' })
    throw error instanceof StockError ? error : new StockError('unavailable', 'Stock download failed', { cause: error })
  }
}
