import type { ReactNode } from 'react'
import { AttentionBell, MobileNav, Sidebar, type ShellInfo } from '@/components/layout/dashboard-nav'
import { Logo } from '@/components/layout/logo'
import { Providers } from '@/components/providers'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getMessages, getTranslator, type MessageKey } from '@/lib/i18n'
import { getAttentionSummary } from '@/lib/data/publishing'
import { countPendingAutopilot } from '@/lib/data/autopilot'
import { formatLocation } from '@/lib/utils/business'
import { DEFAULT_LANGUAGE, isLanguageCode } from '@/lib/config/languages'

/**
 * Protected dashboard shell. requireOnboardedBusiness() verifies the session
 * (redirects to /login) and sends users without a finished business to /onboarding.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { business, profile } = await requireOnboardedBusiness()
  const locale = profile?.preferred_language ?? 'en'
  const t = getTranslator(locale)
  const shell: ShellInfo = {
    businessName: business.business_name,
    businessMeta: [t(`category.${business.business_category}` as MessageKey), formatLocation(business)].filter(Boolean).join(' · '),
    attention: { ...(await getAttentionSummary()), autopilotPending: await countPendingAutopilot() },
  }

  return (
    <Providers locale={locale} messages={getMessages(locale)}>
      <div lang={isLanguageCode(locale) ? locale : DEFAULT_LANGUAGE} className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
        <aside className="hidden border-r border-border bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6">
          <div className="flex items-center justify-between gap-2">
            <Logo href="/dashboard" />
            <AttentionBell attention={shell.attention} />
          </div>
          <Sidebar shell={shell} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur md:hidden">
            <Logo href="/dashboard" />
            <span className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">{business.business_name}</span>
            <AttentionBell attention={shell.attention} className="size-10" />
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">{children}</main>
        </div>
      </div>
      <MobileNav shell={shell} />
    </Providers>
  )
}
