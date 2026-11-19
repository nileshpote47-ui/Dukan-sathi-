import type { AspectRatio } from '@/lib/config/media'
import type { PosterLayoutDefinition } from '@/lib/config/poster-templates'
import type { MarketingContext } from '@/services/ai/types'

/*
 * The only place image prompts are written. A prompt describes VISUALS only: marketing
 * copy stays in the Phase 3 text workflow and is placed on the poster by the template.
 * Owner text is quoted as data. The picture must not contain words, numbers or prices,
 * so it cannot show an invented offer, price, specification or claim.
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
