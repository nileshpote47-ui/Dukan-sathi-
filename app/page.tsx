import { CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalFooter } from '@/components/layout/legal-footer'
import { Logo } from '@/components/layout/logo'
import { buttonVariants } from '@/components/ui/button'
import { getTranslator, type MessageKey } from '@/lib/i18n'

export const metadata: Metadata = { alternates: { canonical: '/' } }

const POINTS: MessageKey[] = ['landing.point1', 'landing.point2', 'landing.point3']

/** Public home page. Static: signed-in users are sent on by the links (proxy redirects /login). */
export default function HomePage() {
  const t = getTranslator('en')
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <Logo />
        <Link href="/login" className={buttonVariants({ variant: 'ghost' })}>
          {t('auth.loginLink')}
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        <p className="font-medium text-primary">{t('app.tagline')}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{t('landing.headline')}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t('landing.subhead')}</p>

        <ul className="mt-8 flex flex-col gap-3">
          {POINTS.map((key) => (
            <li key={key} className="flex items-center gap-3">
              <CheckCircle2 aria-hidden className="size-5 shrink-0 text-primary" />
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={buttonVariants({ size: 'lg' })}>
            {t('landing.cta')}
          </Link>
          <Link href="/login" className={buttonVariants({ size: 'lg', variant: 'secondary' })}>
            {t('landing.login')}
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t('landing.note')}</p>
      </main>
      <LegalFooter />
    </div>
  )
}
