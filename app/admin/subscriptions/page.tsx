import Link from 'next/link'
import { DataTable, KeyCounts, Pager, Tile, pageParam } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { formatPrice } from '@/lib/billing/format'
import { SUBSCRIPTION_STATUSES } from '@/lib/config/billing'
import { ADMIN_PAGE_SIZE, adminSubscriptions } from '@/lib/data/admin'
import { getTranslator } from '@/lib/i18n'
import { formatDate, formatDateTime, intlLocale } from '@/lib/utils/datetime'

/** Read-only view of Phase 5 billing state. Payment/subscription state changes only via signed webhooks. */
export default async function AdminSubscriptionsPage({ searchParams }: PageProps<'/admin/subscriptions'>) {
  const raw = await searchParams
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(String(raw.status)) ? String(raw.status) : undefined
  const page = pageParam(raw.page)
  const data = await adminSubscriptions({ status, page })
  const activePaid = Object.values(data.by_plan_active).reduce((a, b) => a + b, 0)

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('admin.nav.subscriptions')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t('admin.subscriptionsNote')}</p>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('admin.card.subscriptions')} value={activePaid} />
        <Tile label={t('admin.freeBusinesses')} value={Math.max(0, data.businesses_total - activePaid)} />
        <Tile label={t('admin.capturedPayments')} value={`${data.payments.captured} · ${formatPrice(data.payments.captured_paise, 'INR')}`} />
        <Tile label={t('admin.failedPayments')} value={data.payments.failed} />
      </section>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <KeyCounts title={t('admin.activeByPlan')} counts={data.by_plan_active} empty={t('admin.empty')} />
        <KeyCounts title={t('admin.byStatus')} counts={data.by_status} empty={t('admin.empty')} />
      </div>
      <nav aria-label={t('admin.byStatus')} className="mb-3 flex flex-wrap gap-2 text-sm">
        {[undefined, ...SUBSCRIPTION_STATUSES].map((s) => (
          <Link key={s ?? 'all'} href={s ? `/admin/subscriptions?status=${s}` : '/admin/subscriptions'} aria-current={s === status ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">
            {s ?? t('admin.all')}
          </Link>
        ))}
      </nav>
      <DataTable
        caption={t('admin.nav.subscriptions')}
        headers={[t('admin.col.business'), t('admin.plan'), t('admin.col.status'), t('admin.col.provider'), t('admin.col.periodEnd'), t('admin.col.cancelAtEnd'), t('admin.col.updated')]}
        empty={t('admin.empty')}
        rows={data.rows.map((s) => [
          <Link key="b" href={`/admin/businesses/${s.business_id}`} className="underline-offset-4 hover:underline">{s.business ?? s.business_id}</Link>,
          s.plan,
          s.status,
          s.provider,
          s.period_end ? formatDate(s.period_end, locale) : '—',
          s.cancel_at_period_end ? t('admin.yes') : t('admin.no'),
          formatDateTime(s.updated_at, locale),
        ])}
      />
      <Pager basePath="/admin/subscriptions" params={{ status }} page={page} total={data.total} pageSize={ADMIN_PAGE_SIZE} t={t} />
    </>
  )
}
