import Link from 'next/link'
import { RangePicker } from '@/components/analytics/range-picker'
import { DataTable } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { defaultRange, istDay, resolveRange } from '@/lib/analytics/range'
import { FEATURE_KEYS, FEATURE_LABELS } from '@/lib/config/billing'
import { adminUsage } from '@/lib/data/admin'
import { getTranslator } from '@/lib/i18n'

export default async function AdminUsagePage({ searchParams }: PageProps<'/admin/usage'>) {
  const raw = await searchParams
  const t = getTranslator((await getProfile())?.preferred_language)
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const resolved = resolveRange({ preset: str(raw.range), from: str(raw.from), to: str(raw.to) })
  const range = resolved.ok ? resolved.range : defaultRange()
  const data = await adminUsage(range)

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('admin.nav.usage')}</h1>
      <div className="mb-6">
        <RangePicker basePath="/admin/usage" range={range} t={t} today={istDay(new Date())} />
      </div>
      <h2 className="mb-2 font-semibold">{t('admin.byFeature')}</h2>
      <div className="mb-6">
        <DataTable
          caption={t('admin.byFeature')}
          headers={[t('analytics.feature'), t('analytics.used'), t('analytics.failedNotCharged'), t('admin.col.businessesUsing')]}
          empty={t('admin.empty')}
          rows={FEATURE_KEYS.filter((k) => data.by_feature[k]).map((k) => [t(FEATURE_LABELS[k]), data.by_feature[k].used, data.by_feature[k].failed, data.by_feature[k].businesses ?? 0])}
        />
      </div>
      <h2 className="mb-2 font-semibold">{t('admin.topBusinesses')}</h2>
      <DataTable
        caption={t('admin.topBusinesses')}
        headers={[t('admin.col.business'), t('analytics.used')]}
        empty={t('admin.empty')}
        rows={data.top_businesses.map((b) => [
          <Link key="b" href={`/admin/businesses/${b.business_id}`} className="underline-offset-4 hover:underline">{b.business ?? b.business_id}</Link>,
          b.used,
        ])}
      />
    </>
  )
}
