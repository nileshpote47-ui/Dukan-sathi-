import type { Metadata } from 'next'
import { ActivationWatcher } from '@/components/billing/activation-watcher'
import { CancelSubscriptionButton } from '@/components/billing/cancel-subscription-button'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { PlanCard } from '@/components/billing/plan-card'
import { UsageList } from '@/components/billing/usage-list'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { isPaidPlanSlug, planRank } from '@/lib/config/billing'
import { formatPrice, nextPeriodStartIso } from '@/lib/billing/format'
import { getBillingOverview } from '@/lib/data/billing'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDate, intlLocale } from '@/lib/utils/datetime'
import { isBillingConfigured } from '@/services/billing/provider'

export const metadata: Metadata = { title: 'Billing' }

const PAYMENT_STYLE: Record<string, string> = {
  CAPTURED: 'bg-success-soft text-success',
  FAILED: 'bg-destructive-soft text-destructive',
}

export default async function BillingPage({ searchParams }: PageProps<'/dashboard/billing'>) {
  const [{ profile }, { activating }] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const overview = await getBillingOverview()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const { current, currentPlan, state, plans, usage, payments } = overview
  const periodEnd = current?.current_period_end ? formatDate(current.current_period_end, locale) : ''
  const paymentsOnline = isBillingConfigured()
  const expected = typeof activating === 'string' && isPaidPlanSlug(activating) ? plans.find((p) => p.slug === activating) : undefined
  const resetDate = usage[0]?.period_start ? formatDate(nextPeriodStartIso(usage[0].period_start), locale) : ''

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('billing.subtitle')} />

      {expected && <div className="mb-4"><ActivationWatcher expectedPlan={expected.slug} expectedName={expected.name} currentPlan={currentPlan.slug} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="text-base">{t('billing.currentPlan')}</CardTitle>
          <p className="mt-2 text-2xl font-bold">{currentPlan.name}</p>
          <p className="mt-1 text-sm" aria-live="polite">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', state === 'past_due' || state === 'expired' ? 'bg-destructive-soft text-destructive' : 'bg-muted')}>
              {t(`billing.state.${state}` as MessageKey)}
            </span>
          </p>
          {current && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('billing.period')}</dt>
              <dd>
                {current.current_period_start ? formatDate(current.current_period_start, locale) : '—'} – {periodEnd}
              </dd>
              <dt className="text-muted-foreground">{t('billing.price')}</dt>
              <dd>
                {formatPrice(currentPlan.price_paise, currentPlan.currency)} / {t('billing.month')}
              </dd>
            </dl>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {state === 'renewing' && t('billing.renewsOn', { date: periodEnd })}
            {state === 'cancel_at_period_end' && t('billing.endsOn', { date: periodEnd })}
            {state === 'past_due' && t('billing.pastDueHint', { date: periodEnd })}
            {state === 'expired' && t('billing.expiredHint')}
            {state === 'free' && t('billing.freeHint')}
            {state === 'activating' && t('billing.activating')}
          </p>
          {current && !current.cancel_at_period_end && current.status === 'ACTIVE' && (
            <div className="mt-4">
              <CancelSubscriptionButton until={periodEnd} />
            </div>
          )}
        </Card>

        <Card>
          <CardTitle className="text-base">{t('billing.usage')}</CardTitle>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('billing.usageHint', { date: resetDate })}</p>
          <UsageList usage={usage} t={t} />
        </Card>
      </div>

      <section className="mt-8" id="plans" aria-labelledby="plans-title">
        <h2 id="plans-title" className="mb-1 text-xl font-bold">{t('billing.plans')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{paymentsOnline ? t('billing.plansHint') : t('billing.paymentsUnavailable')}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan.id
            const canBuy = paymentsOnline && isPaidPlanSlug(plan.slug) && planRank(plan.slug) > planRank(currentPlan.slug)
            const price = formatPrice(plan.price_paise, plan.currency)
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                t={t}
                current={isCurrent}
                action={
                  canBuy ? (
                    <CheckoutButton planSlug={plan.slug} priceLabel={price} label={t(current ? 'billing.upgradeTo' : 'billing.choosePlan', { plan: plan.name })} />
                  ) : !isCurrent && planRank(plan.slug) < planRank(currentPlan.slug) ? (
                    <p className="text-xs text-muted-foreground">{t('billing.downgradeHint')}</p>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="payments-title">
        <h2 id="payments-title" className="mb-3 text-xl font-bold">{t('billing.paymentHistory')}</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('billing.noPayments')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {payments.map((payment) => {
              const plan = plans.find((p) => p.id === payment.plan_id)
              return (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {plan?.name ?? '—'} · {formatPrice(payment.amount_paise, payment.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.paid_at ?? payment.created_at, locale)} · {payment.provider_payment_id}
                    </p>
                    {payment.failure_reason && <p className="text-xs text-destructive">{payment.failure_reason}</p>}
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PAYMENT_STYLE[payment.status] ?? 'bg-muted')}>
                    {t(`billing.payment.${payment.status}` as MessageKey)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
