import { ArrowLeft, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/logo'
import { Providers } from '@/components/providers'
import { requireAdmin } from '@/lib/auth/admin'
import { getProfile } from '@/lib/auth/dal'
import { getMessages, getTranslator, type MessageKey } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

const NAV: { href: string; key: MessageKey }[] = [
  { href: '/admin', key: 'admin.nav.overview' },
  { href: '/admin/businesses', key: 'admin.nav.businesses' },
  { href: '/admin/users', key: 'admin.nav.users' },
  { href: '/admin/subscriptions', key: 'admin.nav.subscriptions' },
  { href: '/admin/usage', key: 'admin.nav.usage' },
  { href: '/admin/publishing', key: 'admin.nav.publishing' },
  { href: '/admin/system', key: 'admin.nav.system' },
]

/**
 * Internal admin area. requireAdmin() runs on the server for every request (non-admins get a
 * 404, signed-out visitors go to /login); each page's data function checks again in the
 * database and writes an audit record. Navigation is not a security boundary.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  const profile = await getProfile()
  const locale = profile?.preferred_language ?? 'en'
  const t = getTranslator(locale)

  return (
    <Providers locale={locale} messages={getMessages(locale)}>
      <div className="min-h-dvh">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Logo href="/admin" />
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
                <ShieldCheck aria-hidden className="size-3.5" />
                {t('admin.badge')}
              </span>
            </div>
            <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft aria-hidden className="size-4" />
              {t('admin.backToApp')}
            </Link>
          </div>
          <nav aria-label={t('admin.badge')} className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">
                {t(item.key)}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>
    </Providers>
  )
}
