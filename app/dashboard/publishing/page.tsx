import { Link2, Send } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { JobCard } from '@/components/publishing/job-card'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { PUBLISHING_PAGE_SIZE, PUBLISHING_TABS, type PublishingTab } from '@/lib/config/publishing'
import { getPublishingCounts, getPublishingJob, listPublishingJobs, listSocialAccounts } from '@/lib/data/publishing'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { isScheduledLater } from '@/lib/publishing/compose'
import { cn } from '@/lib/utils/cn'
import { intlLocale } from '@/lib/utils/datetime'

export const metadata: Metadata = { title: 'Publishing' }

const isTab = (v: unknown): v is PublishingTab => (PUBLISHING_TABS as readonly unknown[]).includes(v)

export default async function PublishingPage({ searchParams }: PageProps<'/dashboard/publishing'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const highlight = typeof raw.job === 'string' ? raw.job : null
  const page = Math.max(1, Number(raw.page) || 1)

  // A just-created job opens on its tab.
  const highlighted = highlight ? await getPublishingJob(highlight).catch(() => null) : null
  const jobTab: PublishingTab | null = highlighted
    ? highlighted.job.status === 'PUBLISHED'
      ? 'published'
      : highlighted.job.status === 'FAILED'
        ? 'failed'
        : highlighted.job.status === 'CANCELLED'
          ? 'cancelled'
          : isScheduledLater(highlighted.job.status, highlighted.job.scheduled_for)
            ? 'scheduled'
            : 'queued'
    : null
  const tab: PublishingTab = isTab(raw.tab) ? raw.tab : (jobTab ?? 'scheduled')

  const [counts, { items, total }, accounts] = await Promise.all([getPublishingCounts(), listPublishingJobs(tab, page), listSocialAccounts()])
  const pages = Math.max(1, Math.ceil(total / PUBLISHING_PAGE_SIZE))

  return (
    <>
      <PageHeader
        title={t('publishing.title')}
        description={t('publishing.subtitle')}
        actions={
          <Link href="/dashboard/accounts" className={buttonVariants({ variant: 'secondary' })}>
            <Link2 aria-hidden className="size-4" />
            {t('nav.accounts')}
          </Link>
        }
      />

      <nav aria-label={t('publishing.title')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PUBLISHING_TABS.map((key) => (
          <Link
            key={key}
            href={`/dashboard/publishing?tab=${key}`}
            aria-current={key === tab ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
              key === tab ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
            )}
          >
            {t(`publishing.tab.${key}` as MessageKey)}
            <span className={cn('rounded-full px-2 text-xs', key === tab ? 'bg-primary-foreground/20' : 'bg-muted')}>{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Send}
          title={t(`publishing.empty.${tab}` as MessageKey)}
          body={accounts.length ? t('publishing.emptyHint') : t('publishing.form.noAccounts')}
          action={
            <Link href={accounts.length ? '/dashboard/content?status=READY' : '/dashboard/accounts'} className={buttonVariants({})}>
              {accounts.length ? t('nav.content') : t('publishing.connectFirst')}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((job) => (
            <li key={job.id}>
              <JobCard
                job={job}
                t={t}
                locale={locale}
                highlight={job.id === highlight}
                messageStats={job.id === highlighted?.job.id ? highlighted.messages : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <Link href={`/dashboard/publishing?tab=${tab}&page=${page - 1}`} className={buttonVariants({ variant: 'secondary' })}>
              {t('common.back')}
            </Link>
          )}
          {page < pages && (
            <Link href={`/dashboard/publishing?tab=${tab}&page=${page + 1}`} className={buttonVariants({ variant: 'secondary' })}>
              {t('common.next')}
            </Link>
          )}
        </nav>
      )}
    </>
  )
}
