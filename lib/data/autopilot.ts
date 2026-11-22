import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

/* Autopilot reads for the signed-in owner (owner-filtered; RLS enforces the same). */

export type AutopilotSettings = Tables<'autopilot_settings'>
export type AutopilotPostView = Tables<'autopilot_posts'> & { content: Tables<'content_items'> | null }

export async function getAutopilotSettings(): Promise<AutopilotSettings | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('autopilot_settings').select('*').eq('owner_id', user.id).maybeSingle()
  if (error) log.error('[autopilot] read settings', error.code)
  return data ?? null
}

/** Prepared posts of this week and later, oldest first. */
export async function listAutopilotPosts(fromWeekStart: string): Promise<AutopilotPostView[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('autopilot_posts')
    .select('*, content:content_items(*)')
    .eq('owner_id', user.id)
    .gte('week_start', fromWeekStart)
    .order('planned_for')
    .limit(30)
  if (error) log.error('[autopilot] read posts', error.code)
  return (data ?? []) as AutopilotPostView[]
}

export async function getAutopilotPost(id: string): Promise<AutopilotPostView | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase.from('autopilot_posts').select('*, content:content_items(*)').eq('owner_id', user.id).eq('id', id).maybeSingle()
  return (data as AutopilotPostView | null) ?? null
}

/** Posts waiting for the owner's decision whose time has not passed (for the bell and the dashboard). */
export async function countPendingAutopilot(): Promise<number> {
  const user = await requireUser()
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('autopilot_posts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('status', 'PENDING')
    .gt('planned_for', new Date().toISOString())
  if (error) log.error('[autopilot] count pending', error.code)
  return count ?? 0
}
