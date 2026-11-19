import { ImageOff } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

/** Shown for unknown ids and for media that belongs to another account (indistinguishable on purpose). */
export default function MediaNotFound() {
  const t = getTranslator('en')
  return (
    <div className="rounded-2xl border border-border bg-card">
      <EmptyState
        icon={ImageOff}
        title={t('media.notFoundTitle')}
        body={t('media.notFoundBody')}
        action={
          <Link href="/dashboard/media" className={buttonVariants({ variant: 'secondary' })}>
            {t('media.backToList')}
          </Link>
        }
      />
    </div>
  )
}
