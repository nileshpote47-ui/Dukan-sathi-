import { z } from 'zod'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { LANGUAGE_CODES } from '@/lib/config/languages'
import type { MessageKey, TranslationValues } from '@/lib/i18n'

/**
 * Validation messages are translation keys (plus values) encoded as JSON,
 * so the same schema works on the server and shows translated errors in the UI.
 */
export const msg = (key: MessageKey, values?: TranslationValues) => JSON.stringify({ key, values })

export function decodeMessage(message: string | undefined): { key: MessageKey; values?: TranslationValues } {
  try {
    const parsed = JSON.parse(message ?? '')
    if (parsed && typeof parsed.key === 'string') return parsed
  } catch {
    // fall through
  }
  return { key: 'errors.generic' }
}

/** Mirrors the database rules in supabase/migrations. Keep both in sync. */
export const PHONE_PATTERN = /^\+?[0-9]{10,15}$/
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/

/** "98765 43210", "+91-98765-43210" → "9876543210" / "+919876543210" */
export const normalizePhone = (value: string) => value.replace(/[\s\-()]/g, '')

const emptyToNull = (value: string) => (value === '' ? null : value)

export const requiredText = (min: number, max: number) =>
  z
    .string(msg('validation.required'))
    .trim()
    .min(1, msg('validation.required'))
    .min(min, msg('validation.tooShort', { min }))
    .max(max, msg('validation.tooLong', { max }))

export const optionalText = (max: number) =>
  z.string().trim().max(max, msg('validation.tooLong', { max })).transform(emptyToNull)

export const requiredPhone = z
  .string(msg('validation.required'))
  .transform(normalizePhone)
  .pipe(z.string().min(1, msg('validation.required')).regex(PHONE_PATTERN, msg('validation.phone')))

export const optionalPhone = z
  .string()
  .transform(normalizePhone)
  .pipe(z.union([z.literal(''), z.string().regex(PHONE_PATTERN, msg('validation.phone'))]))
  .transform(emptyToNull)

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email(msg('validation.email')).max(254, msg('validation.tooLong', { max: 254 }))]))
  .transform(emptyToNull)

export const optionalPincode = z
  .string()
  .trim()
  .pipe(z.union([z.literal(''), z.string().regex(PINCODE_PATTERN, msg('validation.pincode'))]))
  .transform(emptyToNull)

export const optionalUrl = z
  .string()
  .trim()
  .pipe(
    z.union([
      z.literal(''),
      z
        .url({ protocol: /^https?$/, error: msg('validation.url') })
        .max(500, msg('validation.tooLong', { max: 500 })),
    ]),
  )
  .transform(emptyToNull)

export const category = z.enum(BUSINESS_CATEGORIES, msg('validation.category'))

export const language = z.enum(LANGUAGE_CODES, msg('validation.language'))
