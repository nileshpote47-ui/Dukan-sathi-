import { z } from 'zod'
import { CONTENT_STATUSES, CONTENT_TYPES, FILTERABLE_STATUSES, QUICK_CREATE_BRIEF_MAX, QUICK_CREATE_TYPES } from '@/lib/config/content'
import { AI_INSTRUCTIONS_MAX } from '@/lib/config/ai'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES } from '@/lib/config/marketing'
import { generatedCopySchema } from '@/services/ai/output'
import { language, msg, optionalText, requiredText } from './fields'

/** Optional select: '' means "not set". */
const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.literal(''), z.enum(values, msg('validation.choice'))])
    .optional()
    .transform((v) => (v ? v : null))

/** Fields the owner fills in for a content request. Field names match database columns. */
export const contentFormSchema = z.object({
  content_type: z.enum(CONTENT_TYPES, msg('validation.contentType')),
  title: requiredText(2, 120),
  product_name: optionalText(120),
  offer_text: optionalText(300),
  price: optionalText(50),
  description: optionalText(1000),
  call_to_action: optionalText(120),
  notes: optionalText(1000),
  language,
  template_id: z
    .union([z.literal(''), z.uuid(msg('validation.template'))])
    .optional()
    .transform((v) => v || null),
  tone: optionalChoice(TONES),
  /** AI-generated copy as edited by the owner (Phase 3). null/omitted = none. */
  generated_copy: generatedCopySchema.nullable().optional(),
})

/** Input for "Generate with AI": the content request + optional instructions and previous version. */
export const aiGenerateSchema = contentFormSchema.omit({ generated_copy: true }).extend({
  instructions: optionalText(AI_INSTRUCTIONS_MAX),
  previous: generatedCopySchema.nullable().optional(),
})

/** Dashboard composer: one sentence in the owner's words → a content item + AI copy. */
export const quickCreateSchema = z.object({
  brief: requiredText(5, QUICK_CREATE_BRIEF_MAX),
  content_type: z.enum(QUICK_CREATE_TYPES, msg('validation.contentType')),
  language,
})

export type QuickCreateInput = z.input<typeof quickCreateSchema>

export type AIGenerateInput = z.input<typeof aiGenerateSchema>

export type ContentFormInput = z.input<typeof contentFormSchema>
export type ContentFormOutput = z.output<typeof contentFormSchema>

export const contentIdSchema = z.uuid()

export const statusChangeSchema = z.object({
  id: contentIdSchema,
  to: z.enum(CONTENT_STATUSES),
  /** datetime-local value in IST, required when scheduling. */
  scheduledFor: z.string().max(20).optional(),
})

export const marketingPreferencesSchema = z.object({
  content_language: optionalChoice(['en', 'mr', 'hi'] as const),
  tone: optionalChoice(TONES),
  promotional_style: optionalChoice(PROMOTIONAL_STYLES),
  preferred_contact_method: optionalChoice(CONTACT_METHODS),
  target_customers: optionalText(300),
  preferred_cta: optionalText(120),
  description: optionalText(1000),
})

export type MarketingPreferencesInput = z.input<typeof marketingPreferencesSchema>

export const settingsSchema = z.object({
  preferredLanguage: language,
  productUpdateEmails: z.boolean(),
})

/**
 * Content list URL parameters (?q=&type=&status=&view=&page=).
 * Invalid values fall back to defaults instead of erroring, since URLs are user-editable.
 */
export const contentListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(''),
  type: z.enum(CONTENT_TYPES).optional().catch(undefined),
  status: z
    .enum(FILTERABLE_STATUSES as unknown as [string, ...string[]])
    .optional()
    .catch(undefined),
  view: z.enum(['list', 'grid']).catch('list'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
})

export type ContentListParams = z.output<typeof contentListParamsSchema>

export function parseContentListParams(raw: Record<string, string | string[] | undefined>): ContentListParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  return contentListParamsSchema.parse({
    q: first(raw.q) ?? '',
    type: first(raw.type) || undefined,
    status: first(raw.status) || undefined,
    view: first(raw.view) ?? 'list',
    page: first(raw.page) ?? 1,
  })
}

/** Escape LIKE wildcards so a search for "50%" matches the text "50%" literally. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)
