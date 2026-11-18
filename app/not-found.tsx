import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

export default function NotFound() {
  const t = getTranslator('en')
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        title={t('errors.notFoundTitle')}
        body={t('errors.notFoundBody')}
        action={
          <Link href="/" className={buttonVariants()}>
            {t('errors.goHome')}
          </Link>
        }
      />
    </main>
  )
}
