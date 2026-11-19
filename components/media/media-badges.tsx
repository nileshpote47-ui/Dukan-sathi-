import type { MediaStatus } from '@/lib/config/media'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

const STATUS_STYLES: Record<MediaStatus, string> = {
  GENERATING: 'bg-muted text-foreground',
  READY: 'bg-success-soft text-success',
  FAILED: 'bg-destructive-soft text-destructive',
}

export function MediaStatusBadge({ status, t }: { status: MediaStatus; t: Translate }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>{t(`media.status.${status}` as MessageKey)}</span>
}

export function MediaTypeBadge({ type, source, t }: { type: string; source: string; t: Translate }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {t(`media.type.${type}` as MessageKey)}
      {source === 'AI_GENERATED' ? ' · AI' : ''}
    </span>
  )
}
