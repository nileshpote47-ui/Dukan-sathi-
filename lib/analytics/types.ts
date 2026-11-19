/* Shape returned by analytics_business_overview() (see the analytics migration). */

export interface DailyPoint {
  day: string
  created: number
  published: number
  ai: number
}

export interface ChannelRow {
  channel: string
  published: number
  failed: number
  cancelled: number
}

export interface PublishedItem {
  job_id: string
  title: string
  channel: string
  url: string | null
  published_at: string
}

export interface TopItem extends PublishedItem {
  metrics: Record<string, number>
  fetched_at: string
  engagement: number
}

export interface BusinessAnalytics {
  content: {
    created: number
    created_previous: number
    by_status: Record<string, number>
    by_type: Record<string, number>
    by_language: Record<string, number>
    now: { total: number; draft: number; ready: number; scheduled_upcoming: number; published: number }
  }
  publishing: {
    published: number
    failed: number
    cancelled: number
    pending: number
    published_previous: number
    upcoming: number
    by_channel: ChannelRow[]
    avg_delay_seconds: number | null
    recent_failures: { id: string; title: string; channel: string; error_code: string | null; at: string }[]
    whatsapp: { sent: number; delivered: number; read: number; failed: number }
  }
  daily: DailyPoint[]
  usage: Record<string, { used: number; failed: number }>
  media: { created: number; ai_generated: number; uploaded: number; posters: number; failed: number }
  channels: { connected: Record<string, number>; needs_attention: number }
  top_content: TopItem[]
  recent_published: PublishedItem[]
  metrics_refreshed_at: string | null
}

/** Current month's plan usage (Phase 5 billing_usage_summary). */
export type { UsageRow as PlanUsageRow } from '@/lib/data/billing'
