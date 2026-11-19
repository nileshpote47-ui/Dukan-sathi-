import type { Metadata } from 'next'
import Link from 'next/link'
import { PlanCard } from '@/components/billing/plan-card'
import { Logo } from '@/components/layout/logo'
import { buttonVariants } from '@/components/ui/button'
import { getBusiness, getCurrentUser, getProfile } from '@/lib/auth/dal'
import { getBillingOverview, getPlans } from '@/lib/data/billing'
import { getTranslator } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Pricing', alternates: { canonical: '/pricing' } }

/** Public pricing page. Plans, prices and limits come from the database. */
export default async function PricingPage() {
  const user = await getCurrentUser()
  const [plans, profile, business] = await Promise.all([getPlans(), user ? getProfile() : null, user ? getBusiness() : null])
  const t = getTranslator(profile?.preferred_language)
  const currentPlanId = user && business?.onboarding_completed_at ? (await getBillingOverview()).currentPlan.id : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <Logo href={user ? '/dashboard' : '/'} />
        <Link href={user ? '/dashboard/billing' : '/login'} className={buttonVariants({ variant: 'ghost' })}>
          {user ? t('billing.title') : t('auth.loginLink')}
        </Link>
      </header>
      <main className="py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('billing.pricingTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('billing.pricingSubtitle')}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              t={t}
              current={plan.id === currentPlanId}
              action={
                plan.id === currentPlanId ? undefined : (
                  <Link
                    href={user ? '/dashboard/billing#plans' : '/signup'}
                    className={buttonVariants({ fullWidth: true, variant: plan.slug === 'free' ? 'secondary' : 'primary' })}
                  >
                    {plan.slug === 'free' ? t('billing.startFree') : t('billing.choosePlan', { plan: plan.name })}
                  </Link>
                )
              }
            />
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t('billing.pricingNote')}</p>
      </main>
    </div>
  )
}
