import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { dbError, type ServiceResult } from './errors'
import type { TablesUpdate } from '@/types/database'

/**
 * Business and profile writes. Every function resolves the signed-in user itself
 * and filters by it; row level security enforces the same rule in the database.
 * Callers must validate input with the schemas in lib/validation first.
 */

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

export async function updateProfile(values: {
  full_name?: string
  preferred_language?: string
  product_update_emails?: boolean
}): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').update(values).eq('user_id', user.id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.saveFailed' }
  return { ok: true }
}
