import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CONTENT_TYPE_ICONS, type ContentType } from '@/lib/config/content'
import type { MessageKey, Translate } from '@/lib/i18n'

/** Dashboard shortcut into the create flow with the type preselected. */
export function QuickActionCard({ type, t }: { type: ContentType; t: Translate }) {
  const Icon = CONTENT_TYPE_ICONS[type]
  return (
    <Link
      href={`/dashboard/create?type=${type}`}
      className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex items-center justify-between gap-2 font-semibold">
        {t(`quickAction.${type}` as MessageKey)}
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
