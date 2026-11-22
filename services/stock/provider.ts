import 'server-only'
import type { StockProviderId } from '@/lib/config/stock'
import { MockStockProvider } from './providers/mock'
import { PixabayStockProvider } from './providers/pixabay'
import { StockError, type StockProvider } from './types'

/** STOCK_PROVIDER = pixabay | mock; unset = pixabay when PIXABAY_API_KEY is set, otherwise stock photos are off. */
export function getStockProviderId(): StockProviderId | null {
  const chosen = process.env.STOCK_PROVIDER?.trim().toLowerCase() || (process.env.PIXABAY_API_KEY ? 'pixabay' : '')
  if (chosen === 'pixabay') return process.env.PIXABAY_API_KEY ? 'pixabay' : null
  // The test provider must never serve real users.
  if (chosen === 'mock' && process.env.VERCEL_ENV !== 'production') return 'mock'
  return null
}

export const isStockConfigured = () => getStockProviderId() !== null

export function getStockProvider(): StockProvider {
  const id = getStockProviderId()
  if (!id) throw new StockError('not_configured', 'Stock photos are not configured')
  return id === 'pixabay' ? new PixabayStockProvider({ apiKey: process.env.PIXABAY_API_KEY }) : new MockStockProvider()
}
