import { ArrowRight, CalendarClock, CheckCircle2, ChevronDown, FilePen, Files, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentCard } from '@/components/content/content-card'
import { ContentEmptyState } from '@/components/content/content-empty-state'
import { QuickActionCard } from '@/components/content/quick-action-card'
import { Composer } from '@/components/dashboard/composer'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { QUICK_ACTION_TYPES } from '@/lib/config/content'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/config/languages'
import { getContentCounts, getRecentContent } from '@/lib/data/content'
import { getBillingOverview } from '@/lib/data/billing'
import { UsageList } from '@/components/billing/usage-list'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { profileCompletion } from '@/lib/utils/business'
import { isAIConfigured } from '@/services/ai/provider'
import { intlLocale } from '@/lib/utils/datetime'
import { greetingKey } from '@/lib/utils/greeting'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const [counts, recent, billing] = await Promise.all([getContentCounts(), getRecentContent(5), getBillingOverview()])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const completion = profileCompletion(business)

  // Real numbers from the database only.
  const tiles: { key: MessageKey; value: number; icon: LucideIcon; href: string }[] = [
    { key: 'dashboard.count.total', value: counts.total, icon: Files, href: '/dashboard/content' },
    { key: 'dashboard.count.drafts', value: counts.DRAFT, icon: FilePen, href: '/dashboard/content?status=DRAFT' },
    { key: 'dashboard.count.ready', value: counts.READY, icon: CheckCircle2, href: '/dashboard/content?status=READY' },
    { key: 'dashboard.count.scheduled', value: counts.SCHEDULED, icon: CalendarClock, href: '/dashboard/calendar' },
  ]

  const aiUsage = billing.usage.find((row) => row.feature_key === 'ai_text_generation')
  const contentLanguage = isLanguageCode(business.content_language ?? '')
    ? (business.content_language as LanguageCode)
    : isLanguageCode(profile?.preferred_language ?? '')
      ? (profile!.preferred_language as LanguageCode)
      : DEFAULT_LANGUAGE

  return (
    <>
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <p className="text-muted-foreground">
          {t(greetingKey().replace('greeting.', 'greetingShort.') as MessageKey)}{' '}
          <span className="rounded-full bg-accent-soft px-3 py-0.5 font-semibold text-foreground">{business.business_name}</span>
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t('dashboard.ask')}</h1>
        <p className="text-sm text-muted-foreground">
          {aiUsage
            ? t('dashboard.quota', { remaining: Math.max(aiUsage.remaining, 0), limit: aiUsage.monthly_limit })
            : t('dashboard.welcome')}
        </p>
      </header>

      <Composer defaultLanguage={contentLanguage} remaining={aiUsage ? aiUsage.remaining : null} aiReady={isAIConfigured()} />

      {completion < 100 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('dashboard.completeBusinessTitle')}</p>
            <div className="mt-1.5 flex items-center gap-3">
              <Progress value={completion} label={t('dashboard.completion')} className="max-w-48 flex-1 bg-card" />
              <span className="text-sm font-medium">{completion}%</span>
            </div>
          </div>
          <Link href="/dashboard/business" className={buttonVariants({ size: 'sm', className: 'shrink-0' })}>
            {t('dashboard.goToBusiness')}
          </Link>
        </div>
      )}

      <section aria-labelledby="quick-actions" className="mt-8">
        <h2 id="quick-actions" className="font-display text-xl font-bold">
          {t('dashboard.quickActions')}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {QUICK_ACTION_TYPES.map((type) => (
            <li key={type} className={type === 'WHATSAPP' ? 'col-span-2 md:col-span-1' : undefined}>
              <QuickActionCard type={type} t={t} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent" className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="recent" className="font-display text-xl font-bold">
            {t('dashboard.recent')}
          </h2>
          {recent.length > 0 && (
            <Link href="/dashboard/content" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t('dashboard.viewAll')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-border bg-card">
            <ContentEmptyState t={t} filtered={false} />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {recent.map((item) => (
              <li key={item.id}>
                <ContentCard item={item} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="overview" className="mt-8">
        <h2 id="overview" className="font-display text-xl font-bold">
          {t('dashboard.overview')}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(({ key, value, icon: Icon, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                  {t(key)}
                </span>
                <span className="font-display text-3xl font-bold tabular-nums">{value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="plan-title">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle id="plan-title" className="text-base">
                {t('billing.yourPlan', { plan: billing.currentPlan.name })}
              </CardTitle>
              <CardDescription className="mt-0.5">{t(`billing.state.${billing.state}` as MessageKey)}</CardDescription>
            </div>
            <Link href="/dashboard/billing" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('billing.manage')}
            </Link>
          </div>
          <details className="group mt-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden className="size-4 transition group-open:rotate-180" />
              {t('dashboard.seeUsage')}
            </summary>
            <div className="mt-2">
              <UsageList usage={billing.usage} t={t} compact />
            </div>
          </details>
        </Card>
      </section>
    </>
  )
}
