import { EDITABLE_STATUSES, STATUS_TRANSITIONS, type ContentStatus } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'

/** Mirrors the database trigger; used to show only valid actions and to fail early. */
export const canTransition = (from: ContentStatus, to: ContentStatus) => STATUS_TRANSITIONS[from].includes(to)

export const nextStatuses = (from: ContentStatus) => STATUS_TRANSITIONS[from]

export const isEditable = (status: ContentStatus) => EDITABLE_STATUSES.includes(status)

/** Ready and scheduled content needs something to promote (same rule as the DB constraint). */
export function hasPromotableDetails(item: {
  product_name?: string | null
  offer_text?: string | null
  description?: string | null
}): boolean {
  return Boolean(item.product_name?.trim() || item.offer_text?.trim() || item.description?.trim())
}

/**
 * Checks a status change before it reaches the database.
 * Returns null when allowed, or the message key explaining why not.
 */
export function statusChangeProblem(
  item: { status: ContentStatus; product_name?: string | null; offer_text?: string | null; description?: string | null },
  to: ContentStatus,
  scheduledForIso: string | null,
  now: Date = new Date(),
): MessageKey | null {
  if (!canTransition(item.status, to)) return 'errors.invalidTransition'
  if ((to === 'READY' || to === 'SCHEDULED') && !hasPromotableDetails(item)) return 'errors.needsDetails'
  if (to === 'SCHEDULED') {
    if (!scheduledForIso) return 'errors.scheduleInvalid'
    if (new Date(scheduledForIso).getTime() <= now.getTime()) return 'errors.scheduleInPast'
  }
  return null
}
