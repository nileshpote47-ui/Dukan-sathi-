import {
  Archive,
  CheckCircle2,
  Clock,
  FileImage,
  FilePen,
  Film,
  Megaphone,
  MessageCircle,
  PartyPopper,
  PenSquare,
  Send,
  Shapes,
  type LucideIcon,
} from 'lucide-react'

/**
 * Content types and statuses — the single source of truth.
 * The database check constraints on content_items / content_templates must list the
 * same values (tests/unit/config-sync.test.ts fails if they drift).
 */
export const CONTENT_TYPES = ['POST', 'OFFER', 'POSTER', 'REEL', 'WHATSAPP', 'FESTIVAL', 'OTHER'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const CONTENT_STATUSES = ['DRAFT', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const isContentType = (v: unknown): v is ContentType => (CONTENT_TYPES as readonly unknown[]).includes(v)
export const isContentStatus = (v: unknown): v is ContentStatus => (CONTENT_STATUSES as readonly unknown[]).includes(v)

/**
 * Allowed manual status changes. Mirrors the content_items_guard trigger in the database.
 * PUBLISHED is set only by the publishing system (Phase 6) after a platform confirmed a post;
 * users can never set it (the trigger allows it only inside the publishing database functions).
 * ARCHIVED is final (archived items are read-only but can be deleted).
 */
export const STATUS_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  DRAFT: ['READY', 'ARCHIVED'],
  READY: ['SCHEDULED', 'ARCHIVED'],
  SCHEDULED: ['DRAFT'],
  PUBLISHED: [],
  ARCHIVED: [],
}

/** Statuses whose content can still be edited. */
export const EDITABLE_STATUSES: readonly ContentStatus[] = ['DRAFT', 'READY', 'SCHEDULED']

/** Status filter options on the content list. */
export const FILTERABLE_STATUSES: readonly ContentStatus[] = ['DRAFT', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']

/** Content that can be sent to a connected channel. */
export const PUBLISHABLE_STATUSES: readonly ContentStatus[] = ['READY', 'SCHEDULED', 'PUBLISHED']

/** Dashboard quick actions, in display order. Each opens /dashboard/create?type=<TYPE>. */
export const QUICK_ACTION_TYPES: readonly ContentType[] = ['POST', 'OFFER', 'POSTER', 'REEL', 'WHATSAPP']

export const CONTENT_TYPE_ICONS: Record<ContentType, LucideIcon> = {
  POST: PenSquare,
  OFFER: Megaphone,
  POSTER: FileImage,
  REEL: Film,
  WHATSAPP: MessageCircle,
  FESTIVAL: PartyPopper,
  OTHER: Shapes,
}

/** Status is always shown with an icon and text, never colour alone. */
export const CONTENT_STATUS_ICONS: Record<ContentStatus, LucideIcon> = {
  DRAFT: FilePen,
  READY: CheckCircle2,
  SCHEDULED: Clock,
  PUBLISHED: Send,
  ARCHIVED: Archive,
}

export const CONTENT_PAGE_SIZE = 20
