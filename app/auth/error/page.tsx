import Link from 'next/link'
import { Logo } from '@/components/layout/logo'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

export default function AuthErrorPage() {
  const t = getTranslator('en')
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Logo />
      <main className="mt-8 w-full max-w-md rounded-2xl border border-border bg-card">
        <ErrorState
          title={t('auth.errorTitle')}
          body={t('auth.errorBody')}
          action={
            <Link href="/login" className={buttonVariants()}>
              {t('auth.loginLink')}
            </Link>
          }
        />
      </main>
    </div>
  )
}
