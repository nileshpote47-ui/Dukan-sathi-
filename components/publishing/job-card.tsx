import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ERROR_MESSAGES, MAX_MANUAL_ATTEMPTS, isPublishingErrorCode, isRetryableError } from '@/lib/config/publishing'
import type { PublishingJobView } from '@/lib/data/publishing'
import type { Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/datetime'
import { ChannelLabel, JobStatusBadge } from './badges'
import { JobActions } from './job-actions'

/** One publishing job: where, what, when, result and the actions that are allowed now. */
export function JobCard({
  job,
  t,
  locale,
  highlight = false,
  showContent = true,
  messageStats,
}: {
  job: PublishingJobView
  t: Translate
  locale: string
  highlight?: boolean
  showContent?: boolean
  messageStats?: Record<string, number>
}) {
  const error = isPublishingErrorCode(job.error_code) ? job.error_code : null
  const canRetry = job.status === 'FAILED' && isRetryableError(job.error_code) && job.attempt_count < MAX_MANUAL_ATTEMPTS
  const needsReconnect = error === 'AUTHORIZATION_EXPIRED' || error === 'PERMISSION_DENIED' || error === 'ACCOUNT_NOT_CONNECTED'
  const meta = (job.metadata ?? {}) as { accepted?: number; rejected?: number; recipients?: number }

  return (
    <Card id={`job-${job.id}`} className={cn('flex flex-col gap-3', highlight && 'ring-2 ring-primary')} aria-label={job.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChannelLabel channel={job.channel} t={t} />
        <JobStatusBadge status={job.status} scheduledFor={job.scheduled_for} t={t} />
      </div>
      <div className="flex flex-col gap-1">
        {showContent &&
          (job.content_item_id ? (
            <Link href={`/dashboard/content/${job.content_item_id}`} className="font-semibold underline-offset-4 hover:underline">
              {job.title}
            </Link>
          ) : (
            <p className="font-semibold">
              {job.title} <span className="text-xs font-normal text-muted-foreground">({t('publishing.deletedContent')})</span>
            </p>
          ))}
        <p className="text-sm text-muted-foreground">{job.account?.external_account_name ?? t('publishing.disconnectedAccount')}</p>
        {job.caption && <p className="line-clamp-2 text-sm whitespace-pre-line">{job.caption}</p>}
      </div>

      <p className="text-sm text-muted-foreground">
        {job.status === 'PUBLISHED' && job.published_at
          ? t('publishing.publishedAt', { date: formatDateTime(job.published_at, locale) })
          : job.status === 'QUEUED' || job.status === 'SENDING'
            ? t('publishing.scheduledFor', { date: formatDateTime(job.scheduled_for, locale) })
            : t('publishing.createdAt', { date: formatDateTime(job.created_at, locale) })}
        {job.attempt_count > 1 && <> · {t('publishing.attempts', { n: job.attempt_count })}</>}
      </p>

      {job.channel === 'WHATSAPP' && (messageStats || meta.recipients) && (
        <p className="text-sm">
          {t('publishing.whatsappStats', {
            accepted: (messageStats ? (messageStats.ACCEPTED ?? 0) + (messageStats.SENT ?? 0) + (messageStats.DELIVERED ?? 0) + (messageStats.READ ?? 0) : meta.accepted) ?? 0,
            delivered: (messageStats?.DELIVERED ?? 0) + (messageStats?.READ ?? 0),
            read: messageStats?.READ ?? 0,
            failed: messageStats?.FAILED ?? meta.rejected ?? 0,
          })}
        </p>
      )}

      {error && job.status !== 'PUBLISHED' && (
        <div role={job.status === 'FAILED' ? 'alert' : undefined} className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
          <p className="font-medium">{t(ERROR_MESSAGES[error])}</p>
          {job.status === 'QUEUED' && job.next_attempt_at && (
            <p className="mt-1">{t('publishing.nextAttempt', { date: formatDateTime(job.next_attempt_at, locale) })}</p>
          )}
          {job.error_message && <p className="mt-1 text-xs opacity-80">{t('publishing.technical', { message: job.error_message })}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {job.external_url && (
          <a href={job.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            <ExternalLink aria-hidden className="size-4" />
            {t('publishing.viewPost')}
          </a>
        )}
        {needsReconnect && job.status === 'FAILED' && (
          <Link href="/dashboard/accounts" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            {t('publishing.reconnect')}
          </Link>
        )}
        {error === 'ENTITLEMENT_LIMIT' && (
          <Link href="/dashboard/billing" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            {t('billing.viewPlans')}
          </Link>
        )}
        <JobActions jobId={job.id} canCancel={job.status === 'QUEUED'} canRetry={canRetry} />
      </div>
    </Card>
  )
}
