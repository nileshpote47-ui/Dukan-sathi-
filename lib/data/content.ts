import 'server-only'
import { cache } from 'react'
import { requireUser } from '@/lib/auth/dal'
import { CONTENT_PAGE_SIZE, type ContentStatus } from '@/lib/config/content'
import { createClient } from '@/lib/supabase/server'
import { contentIdSchema, escapeLike, type ContentListParams } from '@/lib/validation/content'
import type { Tables } from '@/types/database'
import { log } from '@/lib/observability/log'

/*
 * Content reads. Like lib/auth/dal.ts, every function verifies the signed-in user
 * itself and filters by owner_id; row level security enforces the same rule in the
 * database, so changing an id in the URL can never reveal someone else's content.
 */

export type ContentItem = Tables<'content_items'>
export type ContentTemplate = Tables<'content_templates'>
export type ContentItemWithTemplate = ContentItem & {
  template: Pick<ContentTemplate, 'id' | 'slug' | 'name' | 'content_type' | 'default_cta'> | null
}

/** Columns for cards and lists (no long text). */
const SUMMARY_COLUMNS =
  'id, title, content_type, status, language, product_name, offer_text, scheduled_for, created_at, updated_at'
export type ContentSummary = Pick<
  ContentItem,
  'id' | 'title' | 'content_type' | 'status' | 'language' | 'product_name' | 'offer_text' | 'scheduled_for' | 'created_at' | 'updated_at'
>

function fail(what: string, error: { code?: string; message: string }): never {
  log.error(`[db] ${what}`, error.code, error.message)
  throw new Error(`Could not load ${what}`)
}

/** One content item with its template, or null if it doesn't exist or isn't yours. */
export const getContentItem = cache(async (id: string): Promise<ContentItemWithTemplate | null> => {
  if (!contentIdSchema.safeParse(id).success) return null
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .select('*, template:content_templates(id, slug, name, content_type, default_cta)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (error) fail('content', error)
  return data as ContentItemWithTemplate | null
})

export async function listContentItems(params: ContentListParams): Promise<{ items: ContentSummary[]; total: number }> {
  const user = await requireUser()
  const supabase = await createClient()
  const from = (params.page - 1) * CONTENT_PAGE_SIZE

  let query = supabase
    .from('content_items')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + CONTENT_PAGE_SIZE - 1)

  if (params.q) query = query.ilike('search_text', `%${escapeLike(params.q.toLowerCase())}%`)
  if (params.type) query = query.eq('content_type', params.type)
  if (params.status) query = query.eq('status', params.status)

  const { data, error, count } = await query
  if (error) fail('content list', error)
  return { items: data ?? [], total: count ?? 0 }
}

export async function getRecentContent(limit = 5): Promise<ContentSummary[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .select(SUMMARY_COLUMNS)
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) fail('recent content', error)
  return data ?? []
}

/** Real counts from the database (head-only queries, run in parallel). */
export async function getContentCounts(): Promise<{ total: number } & Record<'DRAFT' | 'READY' | 'SCHEDULED', number>> {
  const user = await requireUser()
  const supabase = await createClient()
  const count = async (status?: ContentStatus) => {
    let query = supabase.from('content_items').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
    if (status) query = query.eq('status', status)
    const { count: n, error } = await query
    if (error) fail('content counts', error)
    return n ?? 0
  }
  const [total, DRAFT, READY, SCHEDULED] = await Promise.all([count(), count('DRAFT'), count('READY'), count('SCHEDULED')])
  return { total, DRAFT, READY, SCHEDULED }
}

/** Content with a planned date in [startIso, endIso). */
export async function getScheduledBetween(startIso: string, endIso: string): Promise<ContentSummary[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .select(SUMMARY_COLUMNS)
    .eq('owner_id', user.id)
    .gte('scheduled_for', startIso)
    .lt('scheduled_for', endIso)
    .order('scheduled_for', { ascending: true })
  if (error) fail('calendar', error)
  return data ?? []
}

export async function getUpcomingScheduled(fromIso: string, limit = 10): Promise<ContentSummary[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .select(SUMMARY_COLUMNS)
    .eq('owner_id', user.id)
    .eq('status', 'SCHEDULED')
    .gte('scheduled_for', fromIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)
  if (error) fail('upcoming content', error)
  return data ?? []
}

/** Active templates (shared reference data), in display order. */
export const getTemplates = cache(async (): Promise<ContentTemplate[]> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) fail('templates', error)
  return data ?? []
})
