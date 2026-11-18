import type { z } from 'zod'
import type { MessageKey } from '@/lib/i18n'

/**
 * Standard result returned by every Server Action.
 * fieldErrors values are encoded messages (see lib/validation/fields.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: MessageKey }
  | { ok: false; error: MessageKey; fieldErrors?: Record<string, string> }

export function validationFailure(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
  }
  return { ok: false, error: 'errors.validation', fieldErrors }
}
