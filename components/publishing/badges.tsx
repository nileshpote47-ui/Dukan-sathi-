import { AlertTriangle, Ban, CheckCircle2, Clock, Loader2, Send, XCircle } from 'lucide-react'
import { CHANNEL_ICONS, CHANNEL_LABELS, isChannel, type JobStatus } from '@/lib/config/publishing'
import type { MessageKey, Translate } from '@/lib/i18n'
import { isScheduledLater } from '@/lib/publishing/compose'
import { cn } from '@/lib/utils/cn'

/* Hook-free: usable from Server Components (getTranslator) and Client Components (useI18n().t). */

export function ChannelLabel({ channel, t, className }: { channel: string; t: Translate; className?: string }) {
  if (!isChannel(channel)) return null
  const Icon = CHANNEL_ICONS[channel]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', className)}>
      <Icon aria-hidden className="size-4" />
      {t(CHANNEL_LABELS[channel])}
    </span>
  )
}

const JOB_STYLES: Record<JobStatus | 'SCHEDULED', { icon: typeof Clock; className: string }> = {
  QUEUED: { icon: Send, className: 'bg-primary-soft text-primary' },
  SCHEDULED: { icon: Clock, className: 'bg-primary-soft text-primary' },
  SENDING: { icon: Loader2, className: 'bg-accent-soft text-foreground' },
  PUBLISHED: { icon: CheckCircle2, className: 'bg-success-soft text-success' },
  FAILED: { icon: XCircle, className: 'bg-destructive-soft text-destructive' },
  CANCELLED: { icon: Ban, className: 'bg-muted text-muted-foreground' },
}

/** A queued job with a future time is shown as "Scheduled". */
export function JobStatusBadge({ status, scheduledFor, t }: { status: string; scheduledFor?: string | null; t: Translate }) {
  const key = (isScheduledLater(status, scheduledFor) ? 'SCHEDULED' : status) as keyof typeof JOB_STYLES
  const style = JOB_STYLES[key]
  if (!style) return null
  const Icon = style.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', style.className)}>
      <Icon aria-hidden className={cn('size-3.5', key === 'SENDING' && 'animate-spin')} />
      {t(`publishing.status.${key}` as MessageKey)}
    </span>
  )
}

const ACCOUNT_STYLES: Record<string, string> = {
  CONNECTED: 'bg-success-soft text-success',
  EXPIRED: 'bg-destructive-soft text-destructive',
  REVOKED: 'bg-destructive-soft text-destructive',
  ERROR: 'bg-destructive-soft text-destructive',
  DISCONNECTED: 'bg-muted text-muted-foreground',
}

export function AccountStatusBadge({ status, t }: { status: string; t: Translate }) {
  const Icon = status === 'CONNECTED' ? CheckCircle2 : AlertTriangle
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', ACCOUNT_STYLES[status] ?? 'bg-muted')}>
      <Icon aria-hidden className="size-3.5" />
      {t(`publishing.accounts.status.${status}` as MessageKey)}
    </span>
  )
}
