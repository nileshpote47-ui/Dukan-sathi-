import 'server-only'
import { getBusiness, requireUser } from '@/lib/auth/dal'
import type { ContentStatus } from '@/lib/config/content'
import { statusChangeProblem } from '@/lib/content/status'
import { getContentItem } from '@/lib/data/content'
import { createClient } from '@/lib/supabase/server'
import type { ContentFormOutput } from '@/lib/validation/content'
import { dbError, type ServiceResult } from './errors'

/*
 * Content writes. Callers validate input with lib/validation/content.ts first.
 * Ownership always comes from the verified session (never from input), every query
 * also filters by owner_id, and the database enforces RLS and the status lifecycle.
 */

export async function createContentItem(values: ContentFormOutput): Promise<ServiceResult<{ id: string }>> {
  const user = await requireUser()
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return { ok: false, error: 'errors.saveFailed' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .insert({ ...values, owner_id: user.id, business_id: business.id, status: 'DRAFT' })
    .select('id')
    .single()
  if (error) return dbError(error)
  return { ok: true, data: { id: data.id } }
}

export async function updateContentItem(id: string, values: ContentFormOutput): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .update(values)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.contentNotFound' }
  return { ok: true }
}

export async function changeContentStatus(
  id: string,
  to: ContentStatus,
  scheduledForIso: string | null,
): Promise<ServiceResult> {
  const item = await getContentItem(id)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }

  const problem = statusChangeProblem({ ...item, status: item.status as ContentStatus }, to, scheduledForIso)
  if (problem) return { ok: false, error: problem }

  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .update({ status: to, ...(to === 'SCHEDULED' ? { scheduled_for: scheduledForIso } : {}) })
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('status', item.status) // fails safely if someone changed it meanwhile
    .select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.invalidTransition' }
  return { ok: true }
}

export async function deleteContentItem(id: string): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('content_items').delete().eq('id', id).eq('owner_id', user.id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.contentNotFound' }
  return { ok: true }
}
