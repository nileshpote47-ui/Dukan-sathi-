import 'server-only'
import type { PostgrestError } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth/dal'
import type { MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/types/database'

/**
 * Business and profile writes. Every function resolves the signed-in user itself
 * and filters by it; row level security enforces the same rule in the database.
 * Callers must validate input with the schemas in lib/validation first.
 */

export type ServiceResult = { ok: true } | { ok: false; error: MessageKey }

function dbError(error: PostgrestError): ServiceResult {
  // Log the details for developers; show users a friendly message only.
  console.error('[db]', error.code, error.message)
  if (error.code === '23505') return { ok: false, error: 'errors.businessExists' }
  if (error.code === '23514' || error.code === '22001') return { ok: false, error: 'errors.validation' }
  if (error.code === '42501' || error.code === 'PGRST301') return { ok: false, error: 'errors.sessionExpired' }
  return { ok: false, error: 'errors.saveFailed' }
}

/** Create the owner's business, or update name/category if it already exists (one per owner). */
export async function upsertBusinessBasics(values: { business_name: string; business_category: string }): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (readError) return dbError(readError)

  const { error } = existing
    ? await supabase.from('businesses').update(values).eq('id', existing.id).eq('owner_id', user.id)
    : await supabase.from('businesses').insert({ ...values, owner_id: user.id })
  return error ? dbError(error) : { ok: true }
}

export async function updateBusiness(values: TablesUpdate<'businesses'>): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  // owner_id is never taken from input.
  const { owner_id: _ignored, id: _id, ...safe } = values
  void _ignored
  void _id
  const { data, error } = await supabase.from('businesses').update(safe).eq('owner_id', user.id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.saveFailed' }
  return { ok: true }
}

export async function updateProfile(values: { full_name?: string; preferred_language?: string }): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').update(values).eq('user_id', user.id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.saveFailed' }
  return { ok: true }
}
