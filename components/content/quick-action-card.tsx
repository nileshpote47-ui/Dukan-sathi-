import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CONTENT_TYPE_ICONS, type ContentType } from '@/lib/config/content'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/** Soft illustrated panel per type, from theme tokens so both themes read well. */
const ART: Partial<Record<ContentType, string>> = {
  POST: 'bg-[radial-gradient(circle_at_30%_30%,var(--primary-soft),var(--muted))] text-primary',
  OFFER: 'bg-[radial-gradient(circle_at_70%_30%,var(--accent-soft),var(--muted))] text-accent-foreground',
  POSTER: 'bg-[radial-gradient(circle_at_30%_70%,var(--rose-soft),var(--muted))] text-rose',
  REEL: 'bg-[radial-gradient(circle_at_60%_40%,var(--indigo-soft),var(--muted))] text-indigo',
  WHATSAPP: 'bg-[radial-gradient(circle_at_40%_60%,var(--success-soft),var(--muted))] text-success',
}

/** Dashboard shortcut into the create flow with the type preselected. */
export function QuickActionCard({ type, t }: { type: ContentType; t: Translate }) {
  const Icon = CONTENT_TYPE_ICONS[type]
  return (
    <Link
      href={`/dashboard/create?type=${type}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-2.5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className={cn('flex aspect-[16/9] items-center justify-center rounded-xl', ART[type] ?? 'bg-muted text-primary')}>
        <Icon aria-hidden className="size-9 transition group-hover:scale-110" strokeWidth={1.6} />
      </span>
      <span className="flex items-center justify-between gap-2 px-1.5 pb-1 font-display font-bold leading-tight">
        {t(`quickAction.${type}` as MessageKey)}
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
