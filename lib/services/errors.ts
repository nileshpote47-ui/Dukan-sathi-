import 'server-only'
import type { PostgrestError } from '@supabase/supabase-js'
import type { MessageKey } from '@/lib/i18n'

export type ServiceResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: MessageKey }

/**
 * Map a database error to a friendly message. Details are logged for developers
 * and never shown to users.
 */
export function dbError(error: PostgrestError): { ok: false; error: MessageKey } {
  console.error('[db]', error.code, error.message)
  const text = `${error.message} ${error.details ?? ''}`
  switch (error.code) {
    case '23505':
      return { ok: false, error: 'errors.businessExists' }
    case '23514':
      if (text.includes('Archived content')) return { ok: false, error: 'errors.archivedReadOnly' }
      if (text.includes('is not allowed') || text.includes('must start as a draft')) return { ok: false, error: 'errors.invalidTransition' }
      if (text.includes('ready_needs_details')) return { ok: false, error: 'errors.needsDetails' }
      if (text.includes('scheduled_needs_date')) return { ok: false, error: 'errors.scheduleInvalid' }
      return { ok: false, error: 'errors.validation' }
    case '22001':
    case '22P02':
      return { ok: false, error: 'errors.validation' }
    case '42501':
    case 'PGRST301':
      return { ok: false, error: 'errors.sessionExpired' }
    default:
      return { ok: false, error: 'errors.saveFailed' }
  }
}
