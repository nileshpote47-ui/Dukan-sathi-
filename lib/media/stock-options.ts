import 'server-only'
import type { StockOptions } from '@/components/media/stock-photo-search'
import { exampleGroupFor } from '@/lib/config/category-examples'
import { STOCK_SUGGESTIONS } from '@/lib/config/stock'
import type { MessageKey, Translate } from '@/lib/i18n'
import { isStockConfigured } from '@/services/stock/provider'

/** Stock photo options for the picture pickers: availability and suggestions for the shop's category. */
export function stockOptions(category: string | null | undefined, t: Translate): StockOptions {
  if (!isStockConfigured()) return { available: false, suggestions: [] }
  return {
    available: true,
    suggestions: STOCK_SUGGESTIONS[exampleGroupFor(category)].map((s) => ({ label: t(`stock.suggest.${s.key}` as MessageKey), q: s.q })),
  }
}
