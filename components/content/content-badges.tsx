import { CONTENT_STATUS_ICONS, CONTENT_TYPE_ICONS, type ContentStatus, type ContentType } from '@/lib/config/content'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/*
 * Presentational, hook-free components: usable from Server Components (pass
 * getTranslator()) and Client Components (pass useI18n().t).
 */

const STATUS_STYLES: Record<ContentStatus, string> = {
  DRAFT: 'bg-muted text-foreground',
  READY: 'bg-success-soft text-success',
  SCHEDULED: 'bg-primary-soft text-primary',
  PUBLISHED: 'bg-accent-soft text-foreground',
  ARCHIVED: 'bg-muted text-muted-foreground',
}

/** Status shown with icon + text (never colour alone). */
export function ContentStatusBadge({ status, t, className }: { status: string; t: Translate; className?: string }) {
  const key = status as ContentStatus
  const Icon = CONTENT_STATUS_ICONS[key]
  if (!Icon) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        STATUS_STYLES[key],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`contentStatus.${key}` as MessageKey)}
    </span>
  )
}

export function ContentTypeBadge({ type, t, className }: { type: string; t: Translate; className?: string }) {
  const key = type as ContentType
  const Icon = CONTENT_TYPE_ICONS[key]
  if (!Icon) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}>
      <Icon aria-hidden className="size-4" />
      {t(`contentType.${key}` as MessageKey)}
    </span>
  )
}
