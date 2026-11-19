import { AlertTriangle, Download, Info, Lightbulb, ThumbsUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BarList, DailyBars, StatTile } from '@/components/analytics/charts'
import { RangePicker } from '@/components/analytics/range-picker'
import { RefreshEngagementButton } from '@/components/analytics/refresh-engagement-button'
import { UsageList } from '@/components/billing/usage-list'
import { PageHeader } from '@/components/layout/page-header'
import { ChannelLabel } from '@/components/publishing/badges'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { buildInsights } from '@/lib/analytics/insights'
import { compare, defaultRange, istDay, rangeQuery, resolveRange, successRate } from '@/lib/analytics/range'
import { bucketSeries } from '@/lib/analytics/series'
import { FEATURE_KEYS, FEATURE_LABELS } from '@/lib/config/billing'
import { LANGUAGES } from '@/lib/config/languages'
import { ERROR_MESSAGES, isPublishingErrorCode } from '@/lib/config/publishing'
import { getBusinessAnalytics, getPlanUsage } from '@/lib/data/analytics'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'

export const metadata: Metadata = { title: 'Analytics' }

const METRIC_KEYS = ['reactions', 'likes', 'comments', 'shares'] as const

export default async function AnalyticsPage({ searchParams }: PageProps<'/dashboard/analytics'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const str = (v: unknown) => (typeof v === 'string' ? v : null)

  const resolved = resolveRange({ preset: str(raw.range), from: str(raw.from), to: str(raw.to) })
  const range = resolved.ok ? resolved.range : defaultRange()
  const [data, planUsage] = await Promise.all([getBusinessAnalytics(range), getPlanUsage()])
  const insights = buildInsights(data, planUsage)
  const query = rangeQuery(range)
  const num = (n: number) => new Intl.NumberFormat(locale).format(n)

  const rate = successRate(data.publishing.published, data.publishing.failed)
  const connected = Object.values(data.channels.connected).reduce((a, b) => a + b, 0)
  const ai = data.usage.ai_text_generation?.used ?? 0
  const finishedJobs = data.publishing.published + data.publishing.failed + data.publishing.cancelled
  const wa = data.publishing.whatsapp

  return (
    <>
      <PageHeader title={t('analytics.title')} description={t('analytics.subtitle')} />

      <div className="mb-6">
        <RangePicker basePath="/dashboard/analytics" range={range} t={t} today={istDay(new Date())} />
        {!resolved.ok && (
          <p role="alert" className="mt-3 rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
            {t(`analytics.range.error.${resolved.error}` as MessageKey)}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {t('analytics.range.showing', { from: range.fromDay, to: range.toDay, days: range.days })}
        </p>
      </div>

      {insights.length > 0 && (
        <section aria-labelledby="insights" className="mb-6">
          <h2 id="insights" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Lightbulb aria-hidden className="size-5 text-primary" />
            {t('analytics.insights')}
          </h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {insights.map((insight) => {
              const values: Record<string, string | number> = { ...insight.values }
              for (const [k, key] of Object.entries(insight.translate ?? {})) values[k] = t(key)
              const Icon = insight.tone === 'attention' ? AlertTriangle : insight.tone === 'good' ? ThumbsUp : Info
              return (
                <li
                  key={insight.key}
                  className={cn(
                    'flex items-start gap-2 rounded-xl p-3 text-sm',
                    insight.tone === 'attention' ? 'bg-destructive-soft text-destructive' : insight.tone === 'good' ? 'bg-success-soft text-success' : 'bg-primary-soft',
                  )}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span className="text-foreground">{t(insight.key, values)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-label={t('analytics.overview')} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t('analytics.card.created')} value={num(data.content.created)} change={compare(data.content.created, data.content.created_previous)} t={t} />
        <StatTile label={t('analytics.card.published')} value={num(data.publishing.published)} change={compare(data.publishing.published, data.publishing.published_previous)} t={t} />
        <StatTile label={t('analytics.card.scheduled')} value={num(data.publishing.upcoming + data.content.now.scheduled_upcoming)} sub={t('analytics.card.scheduledHint')} t={t} />
        <StatTile label={t('analytics.card.successRate')} value={rate === null ? '—' : `${rate}%`} sub={rate === null ? t('analytics.card.noFinished') : t('analytics.card.successHint', { published: data.publishing.published, failed: data.publishing.failed })} t={t} />
        <StatTile label={t('analytics.card.ai')} value={num(ai)} sub={t('analytics.card.aiHint')} t={t} />
        <StatTile label={t('analytics.card.channels')} value={num(connected)} sub={data.channels.needs_attention ? t('analytics.card.channelsAttention', { n: data.channels.needs_attention }) : undefined} t={t} />
      </section>

      <section aria-labelledby="activity" className="mb-6">
        <h2 id="activity" className="mb-3 text-lg font-semibold">{t('analytics.activity')}</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <DailyBars title={t('analytics.series.created')} buckets={bucketSeries(data.daily, 'created')} locale={locale} t={t} emptyText={t('analytics.empty.created')} />
          <DailyBars title={t('analytics.series.published')} buckets={bucketSeries(data.daily, 'published')} locale={locale} t={t} emptyText={t('analytics.empty.published')} />
          <DailyBars title={t('analytics.series.ai')} buckets={bucketSeries(data.daily, 'ai')} locale={locale} t={t} emptyText={t('analytics.empty.ai')} />
        </div>
      </section>

      <section aria-labelledby="content" className="mb-6">
        <h2 id="content" className="mb-3 text-lg font-semibold">{t('analytics.content')}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <BarList
            title={t('analytics.byType')}
            rows={Object.entries(data.content.by_type).map(([k, v]) => ({ key: k, label: t(`contentType.${k}` as MessageKey), value: v }))}
            emptyText={t('analytics.empty.content')}
          />
          <BarList
            title={t('analytics.byStatus')}
            rows={Object.entries(data.content.by_status).map(([k, v]) => ({ key: k, label: t(`contentStatus.${k}` as MessageKey), value: v }))}
            emptyText={t('analytics.empty.content')}
          />
          <BarList
            title={t('analytics.byLanguage')}
            rows={Object.entries(data.content.by_language).map(([k, v]) => ({ key: k, label: LANGUAGES.find((l) => l.code === k)?.nativeLabel ?? k, value: v }))}
            emptyText={t('analytics.empty.content')}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('analytics.contentNow', { total: data.content.now.total, draft: data.content.now.draft, ready: data.content.now.ready, published: data.content.now.published })}
        </p>
      </section>

      <section aria-labelledby="publishing" className="mb-6">
        <h2 id="publishing" className="mb-3 text-lg font-semibold">{t('analytics.publishing')}</h2>
        {finishedJobs === 0 && data.publishing.pending === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{connected ? t('analytics.empty.publishing') : t('analytics.empty.noChannels')}</p>
            <Link href={connected ? '/dashboard/content?status=READY' : '/dashboard/accounts'} className={buttonVariants({ variant: 'secondary' })}>
              {connected ? t('nav.content') : t('publishing.connectFirst')}
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardTitle className="mb-3 text-base">{t('analytics.byChannel')}</CardTitle>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th scope="col" className="py-1 font-medium">{t('analytics.channel')}</th>
                    <th scope="col" className="py-1 text-right font-medium">{t('publishing.status.PUBLISHED')}</th>
                    <th scope="col" className="py-1 text-right font-medium">{t('publishing.status.FAILED')}</th>
                    <th scope="col" className="py-1 text-right font-medium">{t('publishing.status.CANCELLED')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.publishing.by_channel.map((row) => (
                    <tr key={row.channel} className="border-t border-border">
                      <td className="py-2"><ChannelLabel channel={row.channel} t={t} /></td>
                      <td className="py-2 text-right tabular-nums">{row.published}</td>
                      <td className="py-2 text-right tabular-nums">{row.failed}</td>
                      <td className="py-2 text-right tabular-nums">{row.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.publishing.avg_delay_seconds !== null && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('analytics.avgDelay', { minutes: Math.max(0, Math.round(data.publishing.avg_delay_seconds / 60)) })}
                </p>
              )}
              {wa.sent + wa.failed > 0 && (
                <p className="mt-2 text-sm">
                  {t('publishing.whatsappStats', { accepted: wa.sent, delivered: wa.delivered, read: wa.read, failed: wa.failed })}
                </p>
              )}
            </Card>
            <Card>
              <CardTitle className="mb-3 text-base">{t('analytics.recentFailures')}</CardTitle>
              {data.publishing.recent_failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('analytics.empty.failures')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.publishing.recent_failures.map((f) => (
                    <li key={f.id} className="flex flex-col gap-0.5 border-t border-border pt-2 text-sm first:border-0 first:pt-0">
                      <span className="font-medium">{f.title}</span>
                      <span className="text-muted-foreground">
                        <ChannelLabel channel={f.channel} t={t} className="font-normal" /> · {formatDateTime(f.at, locale)}
                      </span>
                      {isPublishingErrorCode(f.error_code) && <span className="text-destructive">{t(ERROR_MESSAGES[f.error_code])}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/dashboard/publishing?tab=failed" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                {t('nav.publishing')}
              </Link>
            </Card>
          </div>
        )}
      </section>

      <section aria-labelledby="engagement" className="mb-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="engagement" className="text-lg font-semibold">{t('analytics.engagement')}</h2>
            <p className="text-sm text-muted-foreground">{t('analytics.engagementHint')}</p>
            {data.metrics_refreshed_at && (
              <p className="text-xs text-muted-foreground">{t('analytics.refreshedAt', { date: formatDateTime(data.metrics_refreshed_at, locale) })}</p>
            )}
          </div>
          {(data.channels.connected.FACEBOOK || data.channels.connected.INSTAGRAM) ? <RefreshEngagementButton /> : null}
        </div>
        {data.top_content.length > 0 ? (
          <ol className="grid gap-3 md:grid-cols-2">
            {data.top_content.map((item) => (
              <li key={item.job_id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <ChannelLabel channel={item.channel} t={t} />
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                      {t('publishing.viewPost')}
                    </a>
                  )}
                </div>
                <p className="font-medium">{item.title}</p>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {METRIC_KEYS.filter((k) => typeof item.metrics[k] === 'number').map((k) => (
                    <div key={k} className="flex gap-1">
                      <dt className="text-muted-foreground">{t(`analytics.metric.${k}` as MessageKey)}</dt>
                      <dd className="font-semibold tabular-nums">{num(item.metrics[k])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t('analytics.empty.engagement')}</p>
            {data.recent_published.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">{t('analytics.recentPublished')}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {data.recent_published.map((p) => (
                    <li key={p.job_id} className="flex flex-wrap items-center gap-2">
                      <ChannelLabel channel={p.channel} t={t} className="font-normal" />
                      <span>{p.title}</span>
                      <span className="text-muted-foreground">{formatDateTime(p.published_at, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t('analytics.engagementLimits')}</p>
      </section>

      <section aria-labelledby="usage" className="mb-6 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle id="usage" className="mb-1 text-base">{t('analytics.planUsage')}</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">{t('analytics.planUsageHint')}</p>
          {planUsage.length ? <UsageList usage={planUsage} t={t} compact /> : <p className="text-sm text-muted-foreground">{t('analytics.empty.usage')}</p>}
        </Card>
        <Card>
          <CardTitle className="mb-1 text-base">{t('analytics.rangeUsage')}</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">{t('analytics.rangeUsageHint')}</p>
          {Object.keys(data.usage).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('analytics.empty.usage')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">{t('analytics.feature')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t('analytics.used')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t('analytics.failedNotCharged')}</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.filter((k) => data.usage[k]).map((k) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-2">{t(FEATURE_LABELS[k])}</td>
                    <td className="py-2 text-right tabular-nums">{data.usage[k].used}</td>
                    <td className="py-2 text-right tabular-nums">{data.usage[k].failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 text-sm">
            {t('analytics.media', { created: data.media.created, ai: data.media.ai_generated, uploaded: data.media.uploaded, posters: data.media.posters })}
          </p>
        </Card>
      </section>

      <section aria-labelledby="export" className="mb-6">
        <h2 id="export" className="mb-2 text-lg font-semibold">{t('analytics.export')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('analytics.exportHint')}</p>
        <div className="flex flex-wrap gap-2">
          {(['content', 'publishing', 'usage'] as const).map((kind) => (
            <a key={kind} href={`/dashboard/analytics/export?kind=${kind}&${query}`} className={buttonVariants({ variant: 'secondary' })} download>
              <Download aria-hidden className="size-4" />
              {t(`analytics.export.${kind}` as MessageKey)}
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
