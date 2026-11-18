import { z } from 'zod'
import type { ContentType } from '@/lib/config/content'
import { AIError, type AIContentResponse, type OutputField } from './types'

/*
 * Output structure per content type. Providers are asked for the type-specific keys
 * (e.g. "promotional_text"), which read naturally in the prompt; the app stores and
 * shows the normalized fields (e.g. "primary_text"). One table drives the prompt,
 * the JSON schema for structured output, validation and the UI layout.
 */

interface OutputSpecField {
  /** Key requested from the model. */
  key: string
  /** Normalized field it maps to. */
  field: OutputField
  maxLength: number
  /** Instruction for the model. */
  description: string
  required: boolean
}

const headline = (description: string): OutputSpecField => ({ key: 'headline', field: 'headline', maxLength: 120, description, required: true })
const cta: OutputSpecField = {
  key: 'call_to_action',
  field: 'call_to_action',
  maxLength: 120,
  description: 'One short line telling customers what to do next.',
  required: true,
}
const hashtags: OutputSpecField = {
  key: 'hashtags',
  field: 'hashtags',
  maxLength: 8,
  description: '3 to 6 relevant hashtags for the local market, each starting with #, no spaces.',
  required: false,
}

export const OUTPUT_SPEC: Record<ContentType, OutputSpecField[]> = {
  POST: [
    headline('An attention-grabbing first line, under 12 words.'),
    { key: 'primary_text', field: 'primary_text', maxLength: 1200, description: 'The main post text, 2 to 4 short sentences.', required: true },
    cta,
    hashtags,
  ],
  OFFER: [
    headline('The offer headline, under 10 words.'),
    { key: 'promotional_text', field: 'primary_text', maxLength: 1000, description: 'Short promotional text explaining the offer, 2 to 3 sentences.', required: true },
    { key: 'value_message', field: 'short_text', maxLength: 200, description: 'One line on why this is good value for the customer.', required: true },
    cta,
    hashtags,
  ],
  POSTER: [
    headline('Big poster headline, under 8 words.'),
    { key: 'supporting_text', field: 'primary_text', maxLength: 300, description: 'One or two short lines for the poster body.', required: true },
    { key: 'offer_or_value', field: 'short_text', maxLength: 150, description: 'A short highlight of the offer or value (only from the details given).', required: true },
    cta,
  ],
  WHATSAPP: [
    { key: 'opening', field: 'headline', maxLength: 120, description: 'A friendly greeting line for a WhatsApp message.', required: true },
    { key: 'message', field: 'primary_text', maxLength: 1000, description: 'The WhatsApp message body, conversational, 2 to 4 short sentences.', required: true },
    cta,
  ],
  REEL: [
    { key: 'hook', field: 'reel_hook', maxLength: 200, description: 'The first spoken/on-screen line that stops scrolling, under 12 words.', required: true },
    {
      key: 'short_script',
      field: 'reel_script',
      maxLength: 1500,
      description: 'A short reel script of 3 to 5 lines (what to say or show), for a 15–30 second video.',
      required: true,
    },
    cta,
  ],
  FESTIVAL: [
    { key: 'greeting', field: 'headline', maxLength: 150, description: 'A warm festival greeting line.', required: true },
    { key: 'promotion', field: 'primary_text', maxLength: 1000, description: 'The festival promotion text, 2 to 3 sentences.', required: true },
    cta,
  ],
  OTHER: [
    headline('A clear headline, under 12 words.'),
    { key: 'primary_text', field: 'primary_text', maxLength: 1200, description: 'The main text, 2 to 4 short sentences.', required: true },
    cta,
  ],
}

/** Normalized fields shown for a content type, in display order. */
export const outputFieldsFor = (type: ContentType): OutputField[] => OUTPUT_SPEC[type].map((s) => s.field)

/** JSON Schema for structured output (responseJsonSchema). */
export function outputJsonSchema(type: ContentType) {
  const properties: Record<string, unknown> = {}
  for (const spec of OUTPUT_SPEC[type]) {
    properties[spec.key] =
      spec.field === 'hashtags'
        ? { type: 'array', items: { type: 'string' }, maxItems: spec.maxLength, description: spec.description }
        : { type: 'string', description: spec.description }
  }
  return {
    type: 'object',
    properties,
    required: OUTPUT_SPEC[type].filter((s) => s.required).map((s) => s.key),
    additionalProperties: false,
  }
}

/** Text clean-up: trims, collapses 3+ blank lines, removes stray markdown bold markers. */
const tidy = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

function normalizeHashtags(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const word = item.replace(/^#+/, '').replace(/[\s#.,!?;:'"()]+/g, '')
    if (!word || word.length > 40) continue
    const tag = `#${word}`
    if (seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    result.push(tag)
    if (result.length === 8) break
  }
  return result.length ? result : undefined
}

/**
 * Turn a provider's raw output (JSON text or object) into a validated AIContentResponse
 * for the content type. Throws AIError('empty_response' | 'invalid_response').
 */
export function normalizeAIOutput(type: ContentType, raw: unknown): AIContentResponse {
  let data: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
    if (!text) throw new AIError('empty_response', 'Provider returned empty text')
    try {
      data = JSON.parse(text)
    } catch (cause) {
      throw new AIError('invalid_response', 'Provider returned text that is not JSON', { cause })
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AIError('invalid_response', 'Provider output is not an object')
  }

  const source = data as Record<string, unknown>
  const result: AIContentResponse = {}
  for (const spec of OUTPUT_SPEC[type]) {
    const value = source[spec.key]
    if (spec.field === 'hashtags') {
      const tags = normalizeHashtags(value)
      if (tags) result.hashtags = tags
      continue
    }
    if (value === undefined || value === null || value === '') {
      if (spec.required) throw new AIError('invalid_response', `Missing field "${spec.key}"`)
      continue
    }
    if (typeof value !== 'string') throw new AIError('invalid_response', `Field "${spec.key}" is not text`)
    const text = tidy(value)
    if (!text && spec.required) throw new AIError('invalid_response', `Field "${spec.key}" is empty`)
    // Over-long output is cut at a word boundary rather than rejected.
    result[spec.field as Exclude<OutputField, 'hashtags'>] =
      text.length > spec.maxLength ? `${text.slice(0, spec.maxLength).replace(/\s+\S*$/, '')}…` : text
  }

  if (Object.keys(result).length === 0) throw new AIError('empty_response', 'Provider output had no usable fields')
  return result
}

/**
 * Generated copy as stored on content_items.generated_copy and edited by the owner.
 * Validated on every save (the DB also limits the size).
 */
export const generatedCopySchema = z
  .object({
    headline: z.string().trim().max(150).optional(),
    primary_text: z.string().trim().max(1500).optional(),
    short_text: z.string().trim().max(250).optional(),
    call_to_action: z.string().trim().max(150).optional(),
    hashtags: z.array(z.string().trim().min(2).max(41).regex(/^#\S+$/)).max(8).optional(),
    reel_hook: z.string().trim().max(250).optional(),
    reel_script: z.string().trim().max(2000).optional(),
  })
  .strict()
  .transform((copy) => {
    // Drop empty strings so an emptied field is not stored as "".
    const clean: AIContentResponse = {}
    for (const [key, value] of Object.entries(copy)) {
      if (Array.isArray(value) ? value.length : value) (clean as Record<string, unknown>)[key] = value
    }
    return clean
  })

export const hasGeneratedCopy = (copy: AIContentResponse | null | undefined) => Boolean(copy && Object.keys(copy).length)

/** Plain text version of the copy (for "Copy text"), in display order for the content type. */
export function copyToPlainText(type: ContentType, copy: AIContentResponse): string {
  return outputFieldsFor(type)
    .map((field) => (field === 'hashtags' ? copy.hashtags?.join(' ') : copy[field]))
    .filter(Boolean)
    .join('\n\n')
}
