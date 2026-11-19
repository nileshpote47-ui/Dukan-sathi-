import type { ReactNode } from 'react'
import { MobileNav, Sidebar } from '@/components/layout/dashboard-nav'
import { Logo } from '@/components/layout/logo'
import { Providers } from '@/components/providers'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getMessages } from '@/lib/i18n'
import { DEFAULT_LANGUAGE, isLanguageCode } from '@/lib/config/languages'

/**
 * Protected dashboard shell. requireOnboardedBusiness() verifies the session
 * (redirects to /login) and sends users without a finished business to /onboarding.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { business, profile } = await requireOnboardedBusiness()
  const locale = profile?.preferred_language ?? 'en'

  return (
    <Providers locale={locale} messages={getMessages(locale)}>
      <div lang={isLanguageCode(locale) ? locale : DEFAULT_LANGUAGE} className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
        <aside className="hidden border-r border-border bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6">
          <Logo href="/dashboard" />
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur md:hidden">
            <Logo href="/dashboard" />
            <span className="truncate text-sm text-muted-foreground">{business.business_name}</span>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">{children}</main>
        </div>
      </div>
      <MobileNav />
    </Providers>
  )
}
