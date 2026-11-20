/*
 * The owner's own key facts (product, offer, price) must reach the post exactly as typed,
 * even when the AI copy left one out or reworded it. Used by the publish caption and the
 * poster: each fact is added only when the text does not already contain it, so nothing
 * is duplicated and nothing is invented.
 */

export interface OwnerFactsInput {
  product_name?: string | null
  offer_text?: string | null
  price?: string | null
}

export type OwnerFactKind = 'product' | 'offer' | 'price'

const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

/** True when `text` already contains `fact` (case- and spacing-insensitive). */
export function containsFact(text: string, fact: string): boolean {
  const needle = normalize(fact)
  return needle.length > 0 && normalize(text).includes(needle)
}

/** The owner's facts that are missing from `existingText`, in a fixed order. */
export function missingOwnerFacts(item: OwnerFactsInput, existingText: string): { kind: OwnerFactKind; value: string }[] {
  const facts: { kind: OwnerFactKind; value: string | null | undefined }[] = [
    { kind: 'product', value: item.product_name },
    { kind: 'offer', value: item.offer_text },
    { kind: 'price', value: item.price },
  ]
  const missing: { kind: OwnerFactKind; value: string }[] = []
  let seen = existingText
  for (const { kind, value } of facts) {
    const fact = value?.trim()
    if (!fact || containsFact(seen, fact)) continue
    missing.push({ kind, value: fact })
    seen += `\n${fact}`
  }
  return missing
}

const FACT_MARKERS: Record<OwnerFactKind, string> = { product: '🛍️', offer: '🎁', price: '💰' }

/** One caption/poster line per missing fact, e.g. "🎁 10% off on all sweets". */
export function ownerFactLines(item: OwnerFactsInput, existingText: string): string[] {
  return missingOwnerFacts(item, existingText).map(({ kind, value }) => `${FACT_MARKERS[kind]} ${value}`)
}
