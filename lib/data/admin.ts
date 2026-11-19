import 'server-only'
import { requireAdmin } from '@/lib/auth/admin'
import type { DateRange } from '@/lib/analytics/range'
import { createClient } from '@/lib/supabase/server'

/*
 * Admin reads. Each call re-checks admin access on the server (requireAdmin) and the database
 * function checks it again and writes an audit record. Read-only: no admin action changes
 * billing, publishing or user data.
 */

export const ADMIN_PAGE_SIZE = 20

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>)(fn, args)
  if (error) {
    console.error(`[admin] ${fn}`, error.code)
    throw new Error('Could not load admin data')
  }
  return data as T
}

export interface Paged<T> {
  total: number
  rows: T[]
}

export const adminOverview = (range: DateRange) => call<AdminOverview>('admin_overview', { p_from: range.from.toISOString(), p_to: range.to.toISOString() })
export const adminBusinesses = (q: { search?: string; category?: string; plan?: string; page: number }) =>
  call<Paged<AdminBusinessRow>>('admin_list_businesses', {
    p_search: q.search ?? null,
    p_category: q.category || null,
    p_plan: q.plan || null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (q.page - 1) * ADMIN_PAGE_SIZE,
  })
export const adminBusiness = (id: string) => call<AdminBusinessDetail | null>('admin_business_detail', { p_business_id: id })
export const adminUsers = (q: { search?: string; page: number }) =>
  call<Paged<AdminUserRow>>('admin_list_users', { p_search: q.search ?? null, p_limit: ADMIN_PAGE_SIZE, p_offset: (q.page - 1) * ADMIN_PAGE_SIZE })
export const adminUser = (id: string) => call<AdminUserDetail | null>('admin_user_detail', { p_user_id: id })
export const adminSubscriptions = (q: { status?: string; page: number }) =>
  call<AdminSubscriptions>('admin_subscriptions', { p_status: q.status || null, p_limit: ADMIN_PAGE_SIZE, p_offset: (q.page - 1) * ADMIN_PAGE_SIZE })
export const adminUsage = (range: DateRange) => call<AdminUsage>('admin_usage', { p_from: range.from.toISOString(), p_to: range.to.toISOString() })
export const adminPublishing = (q: { status?: string; channel?: string; page: number }) =>
  call<AdminPublishing>('admin_publishing', { p_status: q.status || null, p_channel: q.channel || null, p_limit: ADMIN_PAGE_SIZE, p_offset: (q.page - 1) * ADMIN_PAGE_SIZE })
export const adminSystem = (hours: number) => call<AdminSystem>('admin_system', { p_hours: hours })

type Counts = Record<string, number>
type Usage = Record<string, { used: number; failed: number; businesses?: number }>

export interface AdminOverview {
  users: number
  users_new: number
  businesses: number
  businesses_onboarded: number
  businesses_active: number
  connected_accounts: Counts
  accounts_need_attention: number
  subscriptions_active: Counts
  jobs: Counts
  usage: Usage
}
export interface AdminBusinessRow {
  id: string
  name: string
  category: string
  district: string | null
  state: string | null
  plan: string
  created_at: string
  onboarded: boolean
  content: number
  published: number
  channels: number
}
export interface AdminBusinessDetail {
  business: { id: string; name: string; category: string; district: string | null; state: string | null; created_at: string; onboarded_at: string | null; owner_id: string; owner_email: string | null }
  subscriptions: { plan: string; status: string; provider: string; period_start: string | null; period_end: string | null; cancel_at_period_end: boolean; created_at: string }[]
  payments: { captured: number; captured_paise: number; failed: number }
  usage_this_month: Usage
  content: Counts
  publishing: Counts
  accounts: { channel: string; name: string | null; status: string; connected_at: string }[]
  media: { ready: number; failed: number }
}
export interface AdminUserRow {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed: boolean
  banned: boolean
  is_admin: boolean
  business: { id: string; name: string } | null
}
export interface AdminUserDetail extends Omit<AdminUserRow, 'business'> {
  language: string | null
  businesses: { id: string; name: string; category: string; onboarded: boolean }[]
  activity: { content: number; content_30d: number; published: number; ai_30d: number }
}
export interface AdminSubscriptions extends Paged<{ business_id: string; business: string | null; plan: string; status: string; provider: string; period_end: string | null; cancel_at_period_end: boolean; updated_at: string }> {
  by_status: Counts
  by_plan_active: Counts
  businesses_total: number
  payments: { captured: number; captured_paise: number; failed: number }
}
export interface AdminUsage {
  by_feature: Usage
  top_businesses: { business_id: string; business: string | null; used: number }[]
}
export interface AdminPublishing extends Paged<{ id: string; business_id: string; business: string | null; channel: string; provider: string | null; status: string; attempts: number; error_code: string | null; error_message: string | null; created_at: string; scheduled_for: string; published_at: string | null }> {
  by_status: Counts
  by_channel_failed_7d: Counts
}
export interface AdminSystem {
  since: string
  publishing_failures: { at: string; channel: string; provider: string | null; error_code: string | null; error_message: string | null; business: string | null }[]
  publishing_failures_by_code: Counts
  stuck_sending: number
  billing_webhooks: Counts
  billing_webhook_failures: { at: string; provider: string; event_type: string | null; status: string; error: string | null }[]
  meta_webhooks: Counts
  failed_operations: Counts
  media_failures: number
  scheduler: { last_run: string | null; failed_runs: number } | null
  recent_admin_actions: { at: string; action: string; target_type: string | null; target_id: string | null; actor: string | null }[]
}
