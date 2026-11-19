import { RangePicker } from '@/components/analytics/range-picker'
import { KeyCounts, Tile } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { defaultRange, istDay, resolveRange } from '@/lib/analytics/range'
import { FEATURE_KEYS, FEATURE_LABELS } from '@/lib/config/billing'
import { adminOverview } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'

export default async function AdminOverviewPage({ searchParams }: PageProps<'/admin'>) {
  const raw = await searchParams
  const t = getTranslator((await getProfile())?.preferred_language)
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const resolved = resolveRange({ preset: str(raw.range), from: str(raw.from), to: str(raw.to) })
  const range = resolved.ok ? resolved.range : defaultRange()
  const o = await adminOverview(range)
  const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)
  const aiUsed = o.usage.ai_text_generation?.used ?? 0

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('admin.overview.title')}</h1>
      <div className="mb-6">
        <RangePicker basePath="/admin" range={range} t={t} today={istDay(new Date())} />
      </div>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('admin.card.users')} value={o.users} />
        <Tile label={t('admin.card.businesses')} value={o.businesses} />
        <Tile label={t('admin.card.activeBusinesses')} value={o.businesses_active} />
        <Tile label={t('admin.card.channels')} value={sum(o.connected_accounts)} />
        <Tile label={t('admin.card.subscriptions')} value={sum(o.subscriptions_active)} />
        <Tile label={t('admin.card.jobs')} value={sum(o.jobs)} />
        <Tile label={t('admin.card.failedJobs')} value={o.jobs.FAILED ?? 0} />
        <Tile label={t('admin.card.ai')} value={aiUsed} />
      </section>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('admin.overview.note', { newUsers: o.users_new, onboarded: o.businesses_onboarded, attention: o.accounts_need_attention })}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <KeyCounts title={t('admin.connectedAccounts')} counts={o.connected_accounts} empty={t('admin.empty')} label={(k) => t(`publishing.channel.${k}` as MessageKey)} />
        <KeyCounts title={t('admin.activeSubscriptions')} counts={o.subscriptions_active} empty={t('admin.empty')} />
        <KeyCounts title={t('admin.jobsInRange')} counts={o.jobs} empty={t('admin.empty')} label={(k) => t(`publishing.status.${k}` as MessageKey)} />
        <KeyCounts
          title={t('admin.usageInRange')}
          counts={Object.fromEntries(FEATURE_KEYS.filter((k) => o.usage[k]).map((k) => [k, o.usage[k].used]))}
          empty={t('admin.empty')}
          label={(k) => t(FEATURE_LABELS[k as keyof typeof FEATURE_LABELS])}
        />
        <KeyCounts
          title={t('admin.failedOperations')}
          counts={Object.fromEntries(FEATURE_KEYS.filter((k) => o.usage[k]?.failed).map((k) => [k, o.usage[k].failed]))}
          empty={t('admin.empty')}
          label={(k) => t(FEATURE_LABELS[k as keyof typeof FEATURE_LABELS])}
        />
      </div>
    </>
  )
}
