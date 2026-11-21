import type { AspectRatio } from '@/lib/config/media'
import type { PosterLayoutDefinition } from '@/lib/config/poster-templates'
import type { PosterTexts } from '@/lib/media/poster-layout'
import type { MarketingContext } from '@/services/ai/types'

/*
 * The only place image prompts are written. buildImagePrompt() describes VISUALS only: marketing
 * copy stays in the Phase 3 text workflow and is placed on the poster by the template, so the
 * picture cannot show an invented offer, price, specification or claim.
 *
 * buildDirectPosterPrompt() (Phase 9, owner-requested) is the one exception: the model draws the
 * whole poster including text, but ONLY the owner's own lines, word for word, and nothing else.
 * The owner must confirm the spelling, price and offer before the poster can be published.
 */

export interface ImagePromptInput {
  context: MarketingContext
  item: { title: string; product?: string | null; description?: string | null }
  purpose: 'poster' | 'scene'
  aspectRatio: AspectRatio
  layout?: PosterLayoutDefinition
  /** Storyboard scene direction (owner-editable). */
  visual?: string
}

const quote = (value: string, max = 200) => `"""${value.replace(/"""/g, '"').trim().slice(0, max)}"""`

const CATEGORY_SCENES: Record<string, string> = {
  grocery: 'a neat Indian kirana (grocery) shop',
  mobile_shop: 'a small Indian mobile phone shop',
  clothing: 'an Indian clothing shop',
  electronics: 'an Indian electronics shop',
  hardware: 'an Indian hardware shop',
  footwear: 'an Indian footwear shop',
  jewellery: 'an Indian jewellery shop',
  medical_pharmacy: 'a clean Indian pharmacy',
  restaurant_food: 'an Indian restaurant or food stall',
  bakery: 'an Indian bakery',
  salon: 'a modern Indian salon',
  automobile: 'an Indian automobile service shop',
  repair_services: 'an Indian repair shop',
  coaching_education: 'an Indian coaching classroom',
  agriculture_agro_input: 'an Indian agro-input shop',
  nursery: 'an Indian plant nursery',
  dairy: 'an Indian dairy shop',
  farm_equipment: 'an Indian farm equipment shop',
  furniture: 'an Indian furniture shop',
  stationery: 'an Indian stationery shop',
  other: 'a small local Indian shop',
}

const ASPECT_WORDS: Record<AspectRatio, string> = {
  '1:1': 'square (1:1)',
  '4:5': 'portrait (4:5)',
  '9:16': 'tall vertical (9:16)',
  '16:9': 'wide landscape (16:9)',
}

export function buildImagePrompt(input: ImagePromptInput): string {
  const { context, item, purpose, aspectRatio, layout, visual } = input
  const setting = CATEGORY_SCENES[context.business.category] ?? CATEGORY_SCENES.other
  const subject = item.product?.trim() || item.title.trim()

  const lines = [
    'Create one realistic photograph for a small local business in India.',
    '',
    `SUBJECT: ${quote(subject, 120)}${item.description?.trim() ? `, as described by the owner: ${quote(item.description, 200)}` : ''}.`,
    visual?.trim() ? `SCENE DIRECTION (owner text): ${quote(visual, 200)}` : '',
    `SETTING: ${setting}${context.business.location ? ` in ${quote(context.business.location, 80)}` : ''}.`,
    `VISUAL STYLE: bright natural light, clean and inviting, true-to-life colours${layout ? `, harmonising with ${layout.colors.accent} accents` : ''}; authentic, not luxurious unless the product is.`,
    `COMPOSITION: ${purpose === 'poster' ? 'main subject large and centred, with calm space around it so text can be placed on top later' : 'one clear subject filling the frame, simple background'}.`,
    `ASPECT RATIO: ${ASPECT_WORDS[aspectRatio]}.`,
    '',
    'RULES:',
    '- No words, letters, numbers, prices, logos, watermarks, signs or labels anywhere in the image.',
    '- Do not show brand names or trademarks; show only generic products.',
    '- Do not show anything the owner did not mention: no certificates, awards, discounts or special features.',
    '- Respectful, family-friendly, culturally appropriate for India.',
  ]
  return lines.filter((l) => l !== '').join('\n').replace('RULES:', '\nRULES:')
}

export interface DirectPosterPromptInput {
  context: MarketingContext
  item: { title: string; product?: string | null; description?: string | null }
  aspectRatio: AspectRatio
  layout?: PosterLayoutDefinition
  /** The owner's lines (already validated and length-limited). Empty lines are left out. */
  texts: PosterTexts
}

const DIRECT_LINES: { key: keyof PosterTexts; role: string }[] = [
  { key: 'headline', role: 'Headline (largest text)' },
  { key: 'body', role: 'Message' },
  { key: 'badge', role: 'Offer/price badge (highlighted)' },
  { key: 'cta', role: 'Call to action (button-like)' },
  { key: 'businessName', role: 'Shop name (bottom band)' },
  { key: 'footer', role: 'Place / phone (small, bottom)' },
]

/** The owner's non-empty poster lines, in display order (also used to check the prompt in tests). */
export function directPosterLines(texts: PosterTexts): { role: string; text: string }[] {
  return DIRECT_LINES.flatMap(({ key, role }) =>
    texts[key]
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((text) => ({ role, text })),
  )
}

export function buildDirectPosterPrompt(input: DirectPosterPromptInput): string {
  const { context, item, aspectRatio, layout, texts } = input
  const setting = CATEGORY_SCENES[context.business.category] ?? CATEGORY_SCENES.other
  const subject = item.product?.trim() || item.title.trim()
  const lines = directPosterLines(texts)

  return [
    'Design one finished, premium marketing poster for a small local shop in India.',
    '',
    `SUBJECT TO SHOW: ${quote(subject, 120)}${item.description?.trim() ? `, as described by the owner: ${quote(item.description, 200)}` : ''}.`,
    `SETTING / MOOD: ${setting}${context.business.location ? ` in ${quote(context.business.location, 80)}` : ''}.`,
    `COLOURS: rich and inviting${layout ? `, built around ${layout.colors.accent} accents on ${layout.colors.background[0]} tones` : ''}.`,
    `FORMAT: ${ASPECT_WORDS[aspectRatio]}, readable on a phone; keep every line of text well inside the edges.`,
    '',
    'TEXT ON THE POSTER: write EXACTLY these lines and nothing else. Copy every character, digit, symbol (₹, %) and the script exactly as given (Devanagari stays Devanagari). Do not translate, shorten, correct or add words:',
    ...lines.map(({ role, text }) => `- ${role}: ${quote(text, 200)}`),
    '',
    'RULES:',
    '- No other words, numbers, prices, dates, logos, watermarks or brand names anywhere.',
    '- Do not invent offers, discounts, awards, certificates or product features.',
    '- Clear, high-contrast typography; each line fully visible and correctly spelled.',
    '- Respectful, family-friendly, culturally appropriate for India.',
  ].join('\n')
}
