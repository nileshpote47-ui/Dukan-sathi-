import Link from 'next/link'
import type { ContentSummary } from '@/lib/data/content'
import type { Translate } from '@/lib/i18n'
import { formatDate, formatTime } from '@/lib/utils/datetime'
import { ContentStatusBadge, ContentTypeBadge } from './content-badges'

/** A planned item in the calendar's day panel or upcoming list. */
export function CalendarItem({
  item,
  t,
  locale,
  showDate = false,
}: {
  item: ContentSummary
  t: Translate
  locale: string
  showDate?: boolean
}) {
  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {item.scheduled_for && (
        <time dateTime={item.scheduled_for} className="w-20 shrink-0 text-sm font-semibold text-primary">
          {showDate && <span className="block text-xs font-normal text-muted-foreground">{formatDate(item.scheduled_for, locale)}</span>}
          {formatTime(item.scheduled_for, locale)}
        </time>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium break-words">{item.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <ContentTypeBadge type={item.content_type} t={t} />
          <ContentStatusBadge status={item.status} t={t} />
        </span>
      </span>
    </Link>
  )
}
