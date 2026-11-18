import { ArrowRight, BarChart3, FileImage, Megaphone, MessageCircle, PenSquare, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { LANGUAGES } from '@/lib/config/languages'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatLocation, profileCompletion } from '@/lib/utils/business'
import { greetingKey } from '@/lib/utils/greeting'

export const metadata: Metadata = { title: 'Dashboard' }

/** Placeholders only: content creation is built in a later phase. */
const QUICK_ACTIONS: { key: MessageKey; icon: LucideIcon }[] = [
  { key: 'dashboard.action.post', icon: PenSquare },
  { key: 'dashboard.action.offer', icon: Megaphone },
  { key: 'dashboard.action.poster', icon: FileImage },
  { key: 'dashboard.action.whatsapp', icon: MessageCircle },
]

export default async function DashboardPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  const completion = profileCompletion(business)
  const language = LANGUAGES.find((l) => l.code === profile?.preferred_language)
  const location = formatLocation(business)

  return (
    <>
      <PageHeader title={t(greetingKey(), { name: business.business_name })} description={t('dashboard.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>{t('dashboard.yourBusiness')}</CardTitle>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <SummaryItem label={t('dashboard.category')} value={t(`category.${business.business_category}` as MessageKey)} />
            <SummaryItem label={t('dashboard.language')} value={language?.nativeLabel ?? '—'} />
            <SummaryItem label={t('dashboard.location')} value={location || t('common.notAdded')} />
            <SummaryItem label={t('dashboard.contact')} value={business.phone ?? t('common.notAdded')} />
          </dl>
          {business.brand_tagline && <p className="mt-4 text-muted-foreground italic">“{business.brand_tagline}”</p>}
          <Link href="/dashboard/business" className={buttonVariants({ variant: 'secondary', className: 'mt-5' })}>
            {t('dashboard.viewBusiness')}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Card>

        <Card>
          <CardTitle>{t('dashboard.completion')}</CardTitle>
          <p className="mt-3 text-3xl font-bold">{completion}%</p>
          <Progress value={completion} label={t('dashboard.completion')} className="mt-3" />
          {completion < 100 ? (
            <>
              <CardDescription className="mt-3">{t('dashboard.completionHint')}</CardDescription>
              <Link href="/dashboard/business/edit" className={buttonVariants({ className: 'mt-4', fullWidth: true })}>
                {t('dashboard.completeProfile')}
              </Link>
            </>
          ) : (
            <CardDescription className="mt-3">{t('dashboard.profileComplete')}</CardDescription>
          )}
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="quick-actions">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="quick-actions" className="text-lg font-semibold">
            {t('dashboard.quickActions')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.quickActionsHint')}</p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ key, icon: Icon }) => (
            <li key={key}>
              {/* Disabled on purpose: no fake functionality in Phase 1. */}
              <div
                aria-disabled="true"
                className="flex min-h-28 flex-col justify-between gap-3 rounded-2xl border border-dashed border-border bg-card p-4 text-muted-foreground"
              >
                <Icon aria-hidden className="size-6" />
                <span>
                  <span className="block font-medium text-foreground">{t(key)}</span>
                  <span className="text-xs">{t('common.comingSoon')}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <Card className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <BarChart3 aria-hidden className="size-5 text-muted-foreground" />
          </span>
          <div>
            <CardTitle className="text-base">{t('dashboard.insights')}</CardTitle>
            <CardDescription className="mt-1">{t('dashboard.insightsEmpty')}</CardDescription>
          </div>
        </Card>
      </section>
    </>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  )
}
