import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { istDateKey } from '@/lib/utils/datetime'
import { buildWeek, weekKeys, type WeeklyProgress } from '@/lib/ideas/week'

/*
 * "This week" on the dashboard, from real rows only: content the owner created and posts
 * that were actually published, Monday–Sunday in IST. Owner-filtered (RLS enforces the same).
 */

export async function getWeeklyProgress(now = new Date()): Promise<WeeklyProgress> {
  const user = await requireUser()
  const supabase = await createClient()
  const todayKey = istDateKey(now)
  const startIso = new Date(`${weekKeys(todayKey)[0]}T00:00:00+05:30`).toISOString()

  const [content, published] = await Promise.all([
    supabase.from('content_items').select('created_at').eq('owner_id', user.id).gte('created_at', startIso).limit(1000),
    supabase
      .from('publishing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('status', 'PUBLISHED')
      .gte('published_at', startIso),
  ])
  // A convenience strip: on a read error show an empty week rather than failing the dashboard.
  if (content.error) log.error('[progress] read content', content.error.code)
  if (published.error) log.error('[progress] read published', published.error.code)

  const createdAt = (content.data ?? []).map((row) => row.created_at)
  return { days: buildWeek(todayKey, createdAt), created: createdAt.length, published: published.count ?? 0 }
}
