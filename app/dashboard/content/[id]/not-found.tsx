import { FileQuestion } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

/** Shown for unknown ids and for content that belongs to another account (indistinguishable on purpose). */
export default function ContentNotFound() {
  const t = getTranslator('en')
  return (
    <div className="rounded-2xl border border-border bg-card">
      <EmptyState
        icon={FileQuestion}
        title={t('content.notFoundTitle')}
        body={t('content.notFoundBody')}
        action={
          <Link href="/dashboard/content" className={buttonVariants({ variant: 'secondary' })}>
            {t('content.backToList')}
          </Link>
        }
      />
    </div>
  )
}
