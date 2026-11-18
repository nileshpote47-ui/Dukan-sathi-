import { ArrowRight, CalendarClock, CheckCircle2, FilePen, Files, Sparkles, Store, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentCard } from '@/components/content/content-card'
import { ContentEmptyState } from '@/components/content/content-empty-state'
import { QuickActionCard } from '@/components/content/quick-action-card'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { QUICK_ACTION_TYPES } from '@/lib/config/content'
import { LANGUAGES } from '@/lib/config/languages'
import { getContentCounts, getRecentContent } from '@/lib/data/content'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatLocation, profileCompletion } from '@/lib/utils/business'
import { intlLocale } from '@/lib/utils/datetime'
import { greetingKey } from '@/lib/utils/greeting'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const [counts, recent] = await Promise.all([getContentCounts(), getRecentContent(5)])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const completion = profileCompletion(business)
  const language = LANGUAGES.find((l) => l.code === profile?.preferred_language)

  // Real numbers from the database only.
  const tiles: { key: MessageKey; value: number; icon: LucideIcon; href: string }[] = [
    { key: 'dashboard.count.total', value: counts.total, icon: Files, href: '/dashboard/content' },
    { key: 'dashboard.count.drafts', value: counts.DRAFT, icon: FilePen, href: '/dashboard/content?status=DRAFT' },
    { key: 'dashboard.count.ready', value: counts.READY, icon: CheckCircle2, href: '/dashboard/content?status=READY' },
    { key: 'dashboard.count.scheduled', value: counts.SCHEDULED, icon: CalendarClock, href: '/dashboard/calendar' },
  ]

  return (
    <>
      <PageHeader title={t(greetingKey(), { name: business.business_name })} description={t('dashboard.welcome')} />

      {completion < 100 && (
        <Card className="mb-6 flex flex-col gap-4 border-accent/40 bg-accent-soft sm:flex-row sm:items-center">
          <div className="flex-1">
            <CardTitle className="text-base">{t('dashboard.completeBusinessTitle')}</CardTitle>
            <CardDescription className="mt-1 text-foreground/80">{t('dashboard.completeBusinessBody')}</CardDescription>
            <Progress value={completion} label={t('dashboard.completion')} className="mt-3 max-w-sm bg-card" />
            <p className="mt-1 text-sm font-medium">
              {t('dashboard.completion')}: {completion}%
            </p>
          </div>
          <Link href="/dashboard/business" className={buttonVariants({ className: 'shrink-0' })}>
            {t('dashboard.goToBusiness')}
          </Link>
        </Card>
      )}

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="text-lg font-semibold">
          {t('dashboard.quickActions')}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles aria-hidden className="size-4" />
          {t('ai.notice')}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {QUICK_ACTION_TYPES.map((type) => (
            <li key={type} className={type === 'WHATSAPP' ? 'col-span-2 md:col-span-1' : undefined}>
              <QuickActionCard type={type} t={t} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="overview" className="mt-8">
        <h2 id="overview" className="text-lg font-semibold">
          {t('dashboard.overview')}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(({ key, value, icon: Icon, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                  {t(key)}
                </span>
                <span className="text-3xl font-bold">{value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent" className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="recent" className="text-lg font-semibold">
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

      <section className="mt-8">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Store aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{business.business_name}</CardTitle>
            <CardDescription className="mt-0.5">
              {[t(`category.${business.business_category}` as MessageKey), formatLocation(business), language?.nativeLabel]
                .filter(Boolean)
                .join(' · ')}
            </CardDescription>
          </div>
          <Link href="/dashboard/business" className={buttonVariants({ variant: 'secondary', className: 'shrink-0' })}>
            {t('dashboard.viewBusiness')}
          </Link>
        </Card>
      </section>
    </>
  )
}
