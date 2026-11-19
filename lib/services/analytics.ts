import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { isChannel } from '@/lib/config/publishing'
import type { MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { serverSecret } from '@/services/publishing/env'
import { getPublisher } from '@/services/publishing/registry'
import type { ContentMetricsResult } from '@/services/publishing/types'
import { accountCredentials } from './publishing'
import { log } from '@/lib/observability/log'

/*
 * Explicit "Refresh numbers" for published posts (never on page load). Reads only the owner's
 * own published Facebook/Instagram posts from the last 90 days (max 50), skips posts refreshed
 * in the last 15 minutes, makes one platform call per account and stores snapshots through
 * publishing_save_metrics() (server secret; owners cannot write numbers themselves).
 */

export const REFRESH_COOLDOWN_MS = 2 * 60 * 1000
const FRESH_MS = 15 * 60 * 1000
const SUPPORTED = ['FACEBOOK', 'INSTAGRAM']

export type RefreshResult =
  | { ok: true; updated: number; unavailable: number }
  | { ok: false; error: MessageKey }

export async function refreshEngagement(): Promise<RefreshResult> {
  const user = await requireUser()
  const secret = serverSecret()
  if (!secret) return { ok: false, error: 'publishing.error.notConfigured' }
  const supabase = await createClient()

  const { data: last } = await supabase
    .from('publishing_metrics')
    .select('fetched_at')
    .eq('owner_id', user.id)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last && Date.now() - Date.parse(last.fetched_at) < REFRESH_COOLDOWN_MS) return { ok: false, error: 'analytics.refresh.tooSoon' }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: jobs, error } = await supabase
    .from('publishing_jobs')
    .select('id, channel, social_account_id, external_post_id, published_at, metrics:publishing_metrics(fetched_at)')
    .eq('owner_id', user.id)
    .eq('status', 'PUBLISHED')
    .in('channel', SUPPORTED)
    .not('external_post_id', 'is', null)
    .not('social_account_id', 'is', null)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(50)
  if (error) {
    log.error('[analytics] refresh read', error.code)
    return { ok: false, error: 'analytics.error.load' }
  }

  const due = (jobs ?? []).filter((j) => {
    const fetched = (j.metrics as { fetched_at: string } | { fetched_at: string }[] | null)
    const at = Array.isArray(fetched) ? fetched[0]?.fetched_at : fetched?.fetched_at
    return !at || Date.now() - Date.parse(at) > FRESH_MS
  })
  if (!due.length) return { ok: true, updated: 0, unavailable: 0 }

  // One credentials lookup and one platform call per account (no N+1).
  const byAccount = new Map<string, typeof due>()
  for (const job of due) byAccount.set(job.social_account_id!, [...(byAccount.get(job.social_account_id!) ?? []), job])

  const rows: { job_id: string; status: string; metrics: Record<string, number> }[] = []
  for (const [accountId, accountJobs] of byAccount) {
    const account = await accountCredentials(accountId)
    if (!account || !isChannel(account.channel)) continue // disconnected: keep older numbers
    let results: Record<string, ContentMetricsResult> = {}
    try {
      const publisher = getPublisher(account.channel, account.provider)
      results =
        (await publisher.getContentMetrics?.(
          { accountId, channel: account.channel, externalId: account.externalId, parentId: account.parentId, metadata: {} },
          account.credentials,
          accountJobs.map((j) => j.external_post_id!),
        )) ?? {}
    } catch {
      results = {}
    }
    for (const job of accountJobs) {
      const result = results[job.external_post_id!] ?? { status: 'ERROR', metrics: {} }
      rows.push({ job_id: job.id, status: result.status, metrics: result.metrics })
    }
  }

  if (rows.length) {
    const { error: saveError } = await supabase.rpc('publishing_save_metrics', { p_secret: secret, p_rows: rows as unknown as Json })
    if (saveError) {
      log.error('[analytics] refresh save', saveError.code)
      return { ok: false, error: 'analytics.error.load' }
    }
  }
  const unavailable = rows.filter((r) => r.status !== 'OK').length
  log.info('[analytics] engagement refreshed', { posts: rows.length, unavailable })
  return { ok: true, updated: rows.length - unavailable, unavailable }
}
