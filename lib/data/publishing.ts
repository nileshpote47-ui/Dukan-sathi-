import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { PUBLISHING_PAGE_SIZE, type PublishingTab } from '@/lib/config/publishing'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { log } from '@/lib/observability/log'

/*
 * Publishing reads. Every query runs as the signed-in owner and filters by owner_id; RLS
 * enforces the same. Nothing here can return tokens: credentials and payloads are in tables
 * the API roles cannot read.
 */

export type SocialAccount = Tables<'social_accounts'>
export type PublishingJob = Tables<'publishing_jobs'>
export type PublishingJobView = PublishingJob & { account: Pick<SocialAccount, 'id' | 'external_account_name' | 'status'> | null }
export type WhatsAppContact = Tables<'whatsapp_contacts'>

const fail = (what: string, error: { code?: string; message: string }) => {
  log.error(`[publishing] read ${what}`, error.code)
  throw new Error('Could not load publishing data')
}

const JOB_COLUMNS = '*, account:social_accounts(id, external_account_name, status)'

/** Connected accounts (and ones needing attention); disconnected accounts are history only. */
export async function listSocialAccounts(opts: { includeDisconnected?: boolean } = {}): Promise<SocialAccount[]> {
  const user = await requireUser()
  const supabase = await createClient()
  let query = supabase.from('social_accounts').select('*').eq('owner_id', user.id).order('channel').order('created_at')
  if (!opts.includeDisconnected) query = query.neq('status', 'DISCONNECTED')
  const { data, error } = await query
  if (error) fail('accounts', error)
  return data ?? []
}

export async function getSocialAccount(id: string): Promise<SocialAccount | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('social_accounts').select('*').eq('owner_id', user.id).eq('id', id).maybeSingle()
  if (error) fail('account', error)
  return data
}

function applyTab<Q extends { eq: (c: string, v: string) => Q; gt: (c: string, v: string) => Q; or: (f: string) => Q; in: (c: string, v: string[]) => Q }>(
  query: Q,
  tab: PublishingTab,
  nowIso: string,
): Q {
  switch (tab) {
    case 'scheduled':
      return query.eq('status', 'QUEUED').gt('scheduled_for', nowIso)
    case 'queued':
      return query.or(`status.eq.SENDING,and(status.eq.QUEUED,scheduled_for.lte.${nowIso})`)
    case 'published':
      return query.eq('status', 'PUBLISHED')
    case 'failed':
      return query.eq('status', 'FAILED')
    case 'cancelled':
      return query.eq('status', 'CANCELLED')
  }
}

export async function listPublishingJobs(tab: PublishingTab, page = 1): Promise<{ items: PublishingJobView[]; total: number }> {
  const user = await requireUser()
  const supabase = await createClient()
  const from = (page - 1) * PUBLISHING_PAGE_SIZE
  const base = supabase.from('publishing_jobs').select(JOB_COLUMNS, { count: 'exact' }).eq('owner_id', user.id)
  const ordered = applyTab(base, tab, new Date().toISOString())
    .order(tab === 'scheduled' ? 'scheduled_for' : 'updated_at', { ascending: tab === 'scheduled' })
    .range(from, from + PUBLISHING_PAGE_SIZE - 1)
  const { data, error, count } = await ordered
  if (error) fail('jobs', error)
  return { items: (data ?? []) as PublishingJobView[], total: count ?? 0 }
}

export async function getPublishingCounts(): Promise<Record<PublishingTab, number>> {
  const user = await requireUser()
  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const tabs: PublishingTab[] = ['scheduled', 'queued', 'published', 'failed', 'cancelled']
  const results = await Promise.all(
    tabs.map((tab) => applyTab(supabase.from('publishing_jobs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id), tab, nowIso)),
  )
  const counts = {} as Record<PublishingTab, number>
  tabs.forEach((tab, i) => {
    if (results[i].error) fail('counts', results[i].error!)
    counts[tab] = results[i].count ?? 0
  })
  return counts
}

export async function listJobsForContent(contentId: string, limit = 20): Promise<PublishingJobView[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('publishing_jobs')
    .select(JOB_COLUMNS)
    .eq('owner_id', user.id)
    .eq('content_item_id', contentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail('content jobs', error)
  return (data ?? []) as PublishingJobView[]
}

export interface JobDetail {
  job: PublishingJobView
  attempts: Tables<'publishing_attempts'>[]
  messages: Record<string, number>
}

export async function getPublishingJob(id: string): Promise<JobDetail | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: job, error } = await supabase.from('publishing_jobs').select(JOB_COLUMNS).eq('owner_id', user.id).eq('id', id).maybeSingle()
  if (error) fail('job', error)
  if (!job) return null
  const [attempts, messages] = await Promise.all([
    supabase.from('publishing_attempts').select('*').eq('owner_id', user.id).eq('job_id', id).order('attempt_no'),
    supabase.from('whatsapp_messages').select('status').eq('owner_id', user.id).eq('job_id', id),
  ])
  if (attempts.error) fail('attempts', attempts.error)
  if (messages.error) fail('messages', messages.error)
  const counts: Record<string, number> = {}
  for (const m of messages.data ?? []) counts[m.status] = (counts[m.status] ?? 0) + 1
  return { job: job as PublishingJobView, attempts: attempts.data ?? [], messages: counts }
}

export async function listWhatsAppContacts(): Promise<WhatsAppContact[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('owner_id', user.id)
    .order('opted_out_at', { ascending: true, nullsFirst: true })
    .order('name')
    .limit(500)
  if (error) fail('contacts', error)
  return data ?? []
}
