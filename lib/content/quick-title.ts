/*
 * Title for content made from one sentence on the dashboard: the first clause of the owner's
 * own words (up to the first sentence break, comma or colon), cut at a word boundary.
 * Nothing is invented; the full sentence is kept as the description.
 */
export const QUICK_TITLE_MAX = 80

export function titleFromBrief(brief: string): string {
  const text = brief.replace(/\s+/g, ' ').trim()
  const first = text.split(/[.!?।\n,:;]/)[0]?.trim() ?? ''
  const base = first.length >= 2 ? first : text
  if (base.length <= QUICK_TITLE_MAX) return base
  const cut = base.slice(0, QUICK_TITLE_MAX - 1)
  const atWord = cut.replace(/\s+\S*$/, '')
  return `${(atWord.length >= 20 ? atWord : cut).trimEnd()}…`
}

/** The content form input for a composer sentence: the owner's words as the description, empty optional fields. */
export function quickCreateFormInput(brief: string, content_type: string, language: string) {
  return {
    content_type,
    language,
    title: titleFromBrief(brief),
    description: brief.trim(),
    product_name: '',
    offer_text: '',
    price: '',
    call_to_action: '',
    notes: '',
  }
}
