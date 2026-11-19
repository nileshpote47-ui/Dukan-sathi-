import { z } from 'zod'
import { OPT_IN_SOURCES, PUBLISHING_LIMITS } from '@/lib/config/publishing'
import { msg } from './fields'

/*
 * Publishing input (shared by forms and Server Actions; the server always re-validates).
 * Ownership (business, account, content, contacts) is never taken from these values:
 * the server resolves it from the session and the database checks it again.
 */

const uuid = z.uuid()

export const publishInputSchema = z.object({
  contentId: uuid,
  accountId: uuid,
  mediaAssetId: uuid.nullable().optional(),
  caption: z.string().max(5000),
  mode: z.enum(['now', 'schedule']),
  /** India time "YYYY-MM-DDTHH:mm" (datetime-local). */
  scheduledFor: z.string().max(20).optional(),
  allowRepeat: z.boolean().optional(),
  confirm: z.literal(true, { error: msg('publishing.validation.confirm') }),
  whatsapp: z
    .object({
      templateName: z.string().min(1).max(512),
      language: z.string().min(2).max(15),
      params: z.array(z.string().max(200)).max(PUBLISHING_LIMITS.whatsappMaxParams),
      contactIds: z.array(uuid).min(1).max(PUBLISHING_LIMITS.whatsappMaxRecipients),
    })
    .optional(),
})
export type PublishInput = z.infer<typeof publishInputSchema>

/** Indian mobile numbers by default; full international numbers with a leading +. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  if (/^(0|91)?[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(-10)}`
  return null
}

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, msg('validation.required')).max(80, msg('validation.tooLong', { max: 80 })),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => normalizePhone(v) !== null, msg('publishing.contacts.invalidPhone')),
  optInSource: z.enum(OPT_IN_SOURCES),
  consent: z.literal(true, { error: msg('publishing.contacts.consentRequired') }),
})
export type ContactInput = z.infer<typeof contactInputSchema>

export const whatsappSignupSchema = z.object({
  code: z.string().min(4).max(2000),
  wabaId: z.string().regex(/^\d{5,30}$/),
  phoneNumberId: z.string().regex(/^\d{5,30}$/),
})

export const idSchema = uuid
