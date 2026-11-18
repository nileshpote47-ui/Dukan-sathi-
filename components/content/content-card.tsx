import { CalendarClock, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ContentSummary } from '@/lib/data/content'
import type { Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatDateTime } from '@/lib/utils/datetime'
import { ContentStatusBadge, ContentTypeBadge } from './content-badges'

/**
 * One content item in a list or grid. The whole card is a link to the detail page;
 * extra actions (edit, delete) are passed in as `actions`.
 */
export function ContentCard({
  item,
  t,
  locale,
  layout = 'list',
  actions,
}: {
  item: ContentSummary
  t: Translate
  locale: string
  layout?: 'list' | 'grid'
  actions?: React.ReactNode
}) {
  const subtitle = [item.product_name, item.offer_text].filter(Boolean).join(' · ')
  return (
    <article
      className={cn(
        'relative flex gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50',
        layout === 'grid' ? 'h-full flex-col' : 'flex-col sm:flex-row sm:items-center',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ContentTypeBadge type={item.content_type} t={t} />
          <ContentStatusBadge status={item.status} t={t} />
        </div>
        <h3 className="mt-1.5 text-base font-semibold break-words">
          <Link
            href={`/dashboard/content/${item.id}`}
            className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
          >
            {item.title}
          </Link>
        </h3>
        {subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.scheduled_for && (
            <div className="flex items-center gap-1 font-medium text-primary">
              <CalendarClock aria-hidden className="size-3.5" />
              <dt className="sr-only">{t('content.scheduledFor')}</dt>
              <dd>{formatDateTime(item.scheduled_for, locale)}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt>{t('content.created')}:</dt>
            <dd>{formatDate(item.created_at, locale)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>{t('content.updated')}:</dt>
            <dd>{formatDate(item.updated_at, locale)}</dd>
          </div>
        </dl>
      </div>
      {actions ? (
        <div className="relative z-10 flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : (
        <ChevronRight aria-hidden className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
      )}
    </article>
  )
}
