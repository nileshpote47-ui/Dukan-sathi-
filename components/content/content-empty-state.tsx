import { Plus, SearchX, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import type { Translate } from '@/lib/i18n'

/** Empty content list: first-time ("starts here") or no search/filter matches. */
export function ContentEmptyState({ t, filtered }: { t: Translate; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title={t('content.noMatchTitle')}
        body={t('content.noMatchBody')}
        action={
          <Link href="/dashboard/content" className={buttonVariants({ variant: 'secondary' })}>
            {t('content.clear')}
          </Link>
        }
      />
    )
  }
  return (
    <EmptyState
      icon={Sparkles}
      title={t('content.emptyTitle')}
      body={t('content.emptyBody')}
      action={
        <Link href="/dashboard/create" className={buttonVariants()}>
          <Plus aria-hidden className="size-4" />
          {t('content.new')}
        </Link>
      }
    />
  )
}
