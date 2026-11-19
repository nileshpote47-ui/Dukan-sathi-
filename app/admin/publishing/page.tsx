import Link from 'next/link'
import { DataTable, KeyCounts, Pager, pageParam } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { CHANNELS, JOB_STATUSES } from '@/lib/config/publishing'
import { ADMIN_PAGE_SIZE, adminPublishing } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'

export default async function AdminPublishingPage({ searchParams }: PageProps<'/admin/publishing'>) {
  const raw = await searchParams
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const status = (JOB_STATUSES as readonly string[]).includes(String(raw.status)) ? String(raw.status) : undefined
  const channel = (CHANNELS as readonly string[]).includes(String(raw.channel)) ? String(raw.channel) : undefined
  const page = pageParam(raw.page)
  const data = await adminPublishing({ status, channel, page })

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('admin.nav.publishing')}</h1>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <KeyCounts title={t('admin.byStatus')} counts={data.by_status} empty={t('admin.empty')} label={(k) => t(`publishing.status.${k}` as MessageKey)} />
        <KeyCounts title={t('admin.failed7d')} counts={data.by_channel_failed_7d} empty={t('admin.empty')} label={(k) => t(`publishing.channel.${k}` as MessageKey)} />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('admin.col.status')}</span>
          <select name="status" defaultValue={status ?? ''} className="min-h-11 rounded-xl border border-input bg-card px-3">
            <option value="">{t('admin.all')}</option>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{t(`publishing.status.${s}` as MessageKey)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('analytics.channel')}</span>
          <select name="channel" defaultValue={channel ?? ''} className="min-h-11 rounded-xl border border-input bg-card px-3">
            <option value="">{t('admin.all')}</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{t(`publishing.channel.${c}` as MessageKey)}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted">{t('admin.apply')}</button>
      </form>
      <DataTable
        caption={t('admin.nav.publishing')}
        headers={[t('admin.col.created'), t('admin.col.business'), t('analytics.channel'), t('admin.col.provider'), t('admin.col.status'), t('admin.col.attempts'), t('admin.col.lastError')]}
        empty={t('admin.empty')}
        rows={data.rows.map((j) => [
          formatDateTime(j.created_at, locale),
          <Link key="b" href={`/admin/businesses/${j.business_id}`} className="underline-offset-4 hover:underline">{j.business ?? '—'}</Link>,
          t(`publishing.channel.${j.channel}` as MessageKey),
          j.provider ?? '—',
          t(`publishing.status.${j.status}` as MessageKey),
          j.attempts,
          j.error_code ? `${j.error_code}${j.error_message ? ` — ${j.error_message}` : ''}` : '—',
        ])}
      />
      <Pager basePath="/admin/publishing" params={{ status, channel }} page={page} total={data.total} pageSize={ADMIN_PAGE_SIZE} t={t} />
    </>
  )
}
