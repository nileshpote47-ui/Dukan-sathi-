import type { ExampleGroup } from './category-examples'

/*
 * Free stock photos (Phase 9, Stage 3b) from Pixabay (royalty-free, commercial use allowed, no
 * attribution required — but search results must show where they come from).
 * STOCK_PROVIDER = pixabay | mock (unset = pixabay when PIXABAY_API_KEY is set). mock is refused in production.
 * Rules we follow: searches are cached for 24 hours, a chosen photo is downloaded to our own storage
 * (never hotlinked), only real user searches are sent.
 */
export const STOCK_PROVIDERS = ['pixabay', 'mock'] as const
export type StockProviderId = (typeof STOCK_PROVIDERS)[number]
export const STOCK_SEARCH_CACHE_SECONDS = 24 * 60 * 60
export const STOCK_TIMEOUT_MS = 15_000
export const STOCK_PER_PAGE = 18
export const STOCK_QUERY_MAX = 100
/** Image hosts a stock photo may be downloaded from (the URL itself always comes from the provider, by id). */
export const STOCK_IMAGE_HOSTS = ['pixabay.com', 'cdn.pixabay.com'] as const

/**
 * Pixabay searches in English (it has no Marathi/Hindi). Suggestions per shop group show a translated label
 * and send an English search term (labels: stock.suggest.<key>).
 */
export const STOCK_SUGGESTIONS: Record<ExampleGroup, readonly { key: string; q: string }[]> = {
  grocery: [
    { key: 'spices', q: 'indian spices' },
    { key: 'dryFruits', q: 'dry fruits nuts' },
    { key: 'rice', q: 'rice grains' },
    { key: 'vegetables', q: 'fresh vegetables' },
  ],
  mobile: [
    { key: 'smartphone', q: 'smartphone' },
    { key: 'earphones', q: 'earphones' },
    { key: 'charger', q: 'phone charger cable' },
    { key: 'repair', q: 'phone repair' },
  ],
  fashion: [
    { key: 'saree', q: 'saree' },
    { key: 'clothes', q: 'clothes shop' },
    { key: 'shoes', q: 'shoes' },
    { key: 'jewellery', q: 'gold jewellery' },
  ],
  agri: [
    { key: 'field', q: 'green farm field' },
    { key: 'seeds', q: 'seeds' },
    { key: 'tractor', q: 'tractor' },
    { key: 'plants', q: 'plant nursery' },
  ],
  food: [
    { key: 'sweets', q: 'indian sweets' },
    { key: 'snacks', q: 'samosa' },
    { key: 'cake', q: 'cake' },
    { key: 'tea', q: 'tea cup' },
  ],
  services: [
    { key: 'salon', q: 'hair salon' },
    { key: 'tools', q: 'repair tools' },
    { key: 'books', q: 'books study' },
    { key: 'medicine', q: 'medicine' },
  ],
  general: [
    { key: 'shop', q: 'shop store' },
    { key: 'festival', q: 'diwali lights' },
    { key: 'gift', q: 'gift box' },
    { key: 'sale', q: 'shopping bags' },
  ],
}
