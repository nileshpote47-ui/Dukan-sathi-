import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { toFormValues } from '@/lib/validation/business-values'
import { Logo } from '@/components/layout/logo'
import { Providers } from '@/components/providers'
import { getBusiness, getProfile, requireUser } from '@/lib/auth/dal'
import { getMessages } from '@/lib/i18n'
import { ONBOARDING_STEPS } from '@/lib/validation/business'
import type { Tables } from '@/types/database'
import { OnboardingWizard } from './onboarding-wizard'

export const metadata: Metadata = { title: 'Set up your business' }

/** First step that still needs input, so returning users continue where they stopped. */
function resumeStep(business: Tables<'businesses'> | null): number {
  if (!business) return 0
  if (!business.phone) return ONBOARDING_STEPS.indexOf('contact')
  if (!business.village || !business.district || !business.state) return ONBOARDING_STEPS.indexOf('location')
  return ONBOARDING_STEPS.indexOf('language')
}

export default async function OnboardingPage() {
  await requireUser()
  const [business, profile] = await Promise.all([getBusiness(), getProfile()])
  if (business?.onboarding_completed_at) redirect('/dashboard')

  const locale = profile?.preferred_language ?? 'en'

  return (
    <Providers locale={locale} messages={getMessages(locale)}>
      <div className="flex min-h-dvh flex-col px-4 py-6">
        <header className="mx-auto w-full max-w-xl">
          <Logo href="/onboarding" />
        </header>
        <main className="mt-6 flex-1">
          <OnboardingWizard
            initialValues={toFormValues(business, profile)}
            initialStep={resumeStep(business)}
            resumed={Boolean(business)}
          />
        </main>
      </div>
    </Providers>
  )
}
