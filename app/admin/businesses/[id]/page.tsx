import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DataTable, KeyCounts } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { formatPrice } from '@/lib/billing/format'
import { FEATURE_KEYS, FEATURE_LABELS } from '@/lib/config/billing'
import { adminBusiness } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatDate, formatDateTime, intlLocale } from '@/lib/utils/datetime'
import { idSchema } from '@/lib/validation/publishing'

export default async function AdminBusinessPage({ params }: PageProps<'/admin/businesses/[id]'>) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const d = await adminBusiness(id)
  if (!d) notFound()
  const b = d.business

  return (
    <>
      <Link href="/admin/businesses" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← {t('admin.nav.businesses')}</Link>
      <h1 className="text-2xl font-bold">{b.name}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {t(`category.${b.category}` as MessageKey)} · {[b.district, b.state].filter(Boolean).join(', ') || '—'} · {t('admin.col.created')} {formatDate(b.created_at, locale)} ·{' '}
        {b.onboarded_at ? t('admin.onboarded') : t('admin.notOnboarded')}
      </p>
      <p className="mb-6 text-sm">
        {t('admin.owner')}: <Link href={`/admin/users/${b.owner_id}`} className="underline underline-offset-4">{b.owner_email ?? b.owner_id}</Link>
      </p>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <KeyCounts title={t('admin.content')} counts={d.content} empty={t('admin.empty')} label={(k) => t(`contentStatus.${k}` as MessageKey)} />
        <KeyCounts title={t('admin.publishing')} counts={d.publishing} empty={t('admin.empty')} label={(k) => t(`publishing.status.${k}` as MessageKey)} />
        <KeyCounts
          title={t('admin.usageThisMonth')}
          counts={Object.fromEntries(FEATURE_KEYS.filter((k) => d.usage_this_month[k]).map((k) => [k, d.usage_this_month[k].used]))}
          empty={t('admin.empty')}
          label={(k) => t(FEATURE_LABELS[k as keyof typeof FEATURE_LABELS])}
        />
      </div>
      <p className="mb-6 text-sm">
        {t('admin.paymentsSummary', { captured: d.payments.captured, amount: formatPrice(d.payments.captured_paise, 'INR'), failed: d.payments.failed })} ·{' '}
        {t('admin.mediaSummary', { ready: d.media.ready, failed: d.media.failed })}
      </p>

      <h2 className="mb-2 font-semibold">{t('admin.nav.subscriptions')}</h2>
      <div className="mb-6">
        <DataTable
          caption={t('admin.nav.subscriptions')}
          headers={[t('admin.plan'), t('admin.col.status'), t('admin.col.provider'), t('admin.col.periodEnd'), t('admin.col.cancelAtEnd')]}
          empty={t('admin.empty')}
          rows={d.subscriptions.map((s) => [s.plan, s.status, s.provider, s.period_end ? formatDate(s.period_end, locale) : '—', s.cancel_at_period_end ? t('admin.yes') : t('admin.no')])}
        />
      </div>

      <h2 className="mb-2 font-semibold">{t('admin.connectedAccounts')}</h2>
      <DataTable
        caption={t('admin.connectedAccounts')}
        headers={[t('analytics.channel'), t('admin.col.name'), t('admin.col.status'), t('admin.col.connected')]}
        empty={t('admin.empty')}
        rows={d.accounts.map((a) => [t(`publishing.channel.${a.channel}` as MessageKey), a.name ?? '—', a.status, formatDateTime(a.connected_at, locale)])}
      />
    </>
  )
}
