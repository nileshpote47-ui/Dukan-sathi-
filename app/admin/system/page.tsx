import Link from 'next/link'
import { DataTable, KeyCounts, Tile } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { FEATURE_LABELS } from '@/lib/config/billing'
import { adminSystem } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'

const WINDOWS = [24, 168, 720] as const

/** Lightweight operational view (full observability is Phase 8). */
export default async function AdminSystemPage({ searchParams }: PageProps<'/admin/system'>) {
  const raw = await searchParams
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const hours = WINDOWS.find((w) => String(w) === raw.hours) ?? 24
  const s = await adminSystem(hours)

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('admin.nav.system')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t('admin.systemNote')}</p>
      <nav className="mb-6 flex gap-2 text-sm" aria-label={t('admin.window')}>
        {WINDOWS.map((w) => (
          <Link key={w} href={`/admin/system?hours=${w}`} aria-current={w === hours ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center rounded-full border border-border px-3', w === hours && 'bg-primary text-primary-foreground')}>
            {t(`admin.window.${w}` as MessageKey)}
          </Link>
        ))}
      </nav>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('admin.sys.publishingFailures')} value={Object.values(s.publishing_failures_by_code).reduce((a, b) => a + b, 0)} />
        <Tile label={t('admin.sys.stuck')} value={s.stuck_sending} />
        <Tile label={t('admin.sys.mediaFailures')} value={s.media_failures} />
        <Tile label={t('admin.sys.scheduler')} value={s.scheduler?.last_run ? formatDateTime(s.scheduler.last_run, locale) : '—'} />
      </section>
      <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KeyCounts title={t('admin.sys.failuresByCode')} counts={s.publishing_failures_by_code} empty={t('admin.none')} />
        <KeyCounts title={t('admin.sys.failedOperations')} counts={s.failed_operations} empty={t('admin.none')} label={(k) => t(FEATURE_LABELS[k as keyof typeof FEATURE_LABELS] ?? 'admin.unknown')} />
        <KeyCounts title={t('admin.sys.billingWebhooks')} counts={s.billing_webhooks} empty={t('admin.none')} />
        <KeyCounts title={t('admin.sys.metaWebhooks')} counts={s.meta_webhooks} empty={t('admin.none')} />
      </div>
      {s.scheduler && s.scheduler.failed_runs > 0 && (
        <p role="alert" className="mb-4 rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{t('admin.sys.schedulerFailed', { n: s.scheduler.failed_runs })}</p>
      )}
      <h2 className="mb-2 font-semibold">{t('admin.sys.recentPublishingFailures')}</h2>
      <div className="mb-6">
        <DataTable
          caption={t('admin.sys.recentPublishingFailures')}
          headers={[t('admin.col.time'), t('admin.col.business'), t('analytics.channel'), t('admin.col.provider'), t('admin.col.lastError')]}
          empty={t('admin.none')}
          rows={s.publishing_failures.map((f) => [formatDateTime(f.at, locale), f.business ?? '—', t(`publishing.channel.${f.channel}` as MessageKey), f.provider ?? '—', `${f.error_code ?? ''}${f.error_message ? ` — ${f.error_message}` : ''}`])}
        />
      </div>
      <h2 className="mb-2 font-semibold">{t('admin.sys.billingWebhookFailures')}</h2>
      <div className="mb-6">
        <DataTable
          caption={t('admin.sys.billingWebhookFailures')}
          headers={[t('admin.col.time'), t('admin.col.provider'), t('admin.col.event'), t('admin.col.lastError')]}
          empty={t('admin.none')}
          rows={s.billing_webhook_failures.map((f) => [formatDateTime(f.at, locale), f.provider, f.event_type ?? '—', f.error ?? '—'])}
        />
      </div>
      <h2 className="mb-2 font-semibold">{t('admin.sys.audit')}</h2>
      <DataTable
        caption={t('admin.sys.audit')}
        headers={[t('admin.col.time'), t('admin.col.admin'), t('admin.col.action'), t('admin.col.target')]}
        empty={t('admin.none')}
        rows={s.recent_admin_actions.map((a) => [formatDateTime(a.at, locale), a.actor ?? '—', a.action, a.target_id ? `${a.target_type}: ${a.target_id}` : '—'])}
      />
    </>
  )
}
