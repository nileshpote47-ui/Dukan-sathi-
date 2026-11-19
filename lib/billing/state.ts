import type { SubscriptionStatus } from '@/lib/config/billing'

/*
 * Pure billing-state rules for DISPLAY. They mirror the database function
 * billing_entitling_subscription(), which is what actually decides limits (server-side).
 */

export interface SubscriptionLike {
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Same rule as the database: only ACTIVE gives paid access, until the period end + 1 day
 * (time for the renewal webhook). A failed renewal (PAST_DUE) pauses access immediately.
 */
export function isEntitling(sub: SubscriptionLike, now = Date.now()): boolean {
  if (sub.status !== 'ACTIVE' || !sub.current_period_end) return false
  return now < new Date(sub.current_period_end).getTime() + DAY
}

export function entitlingSubscription<T extends SubscriptionLike>(subs: T[], now = Date.now()): T | null {
  return (
    [...subs]
      .filter((s) => isEntitling(s, now))
      .sort((a, b) => (b.current_period_start ?? b.created_at).localeCompare(a.current_period_start ?? a.created_at))[0] ?? null
  )
}

export type BillingDisplayState = 'free' | 'renewing' | 'cancel_at_period_end' | 'past_due' | 'activating' | 'expired'

/** What the owner sees on the billing page. Never derived from the browser. */
export function displayState(current: SubscriptionLike | null, latest: SubscriptionLike | null, now = Date.now()): BillingDisplayState {
  if (current) return current.cancel_at_period_end ? 'cancel_at_period_end' : 'renewing'
  if (latest?.status === 'AUTHENTICATED') return 'activating'
  if (latest?.status === 'PAST_DUE') return 'past_due'
  if (latest && (['ACTIVE', 'EXPIRED', 'CANCELLED'] as SubscriptionStatus[]).includes(latest.status as SubscriptionStatus)) {
    // Had a paid plan that is no longer active (period over, cancelled or renewal failed).
    if (latest.current_period_end && new Date(latest.current_period_end).getTime() <= now + DAY) return 'expired'
  }
  return 'free'
}

export type UsageLevel = 'available' | 'low' | 'reached'

export function usageLevel(remaining: number, limit: number, lowShare: number): UsageLevel {
  if (remaining <= 0) return 'reached'
  if (limit > 0 && remaining / limit <= lowShare) return 'low'
  return 'available'
}
