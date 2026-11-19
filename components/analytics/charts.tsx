import type { ReactNode } from 'react'
import type { Bucket } from '@/lib/analytics/series'
import { hasActivity, niceMax } from '@/lib/analytics/series'
import type { compare } from '@/lib/analytics/range'
import type { Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/*
 * Hook-free chart pieces (Server Components). One series per chart, one validated mark colour
 * (--chart-1), recessive axis, native tooltips, a table view, and an empty state instead of a
 * flat line of zeros when there is no activity.
 */

const fmtDay = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

export function StatTile({
  label,
  value,
  sub,
  change,
  t,
}: {
  label: string
  value: string
  sub?: ReactNode
  change?: ReturnType<typeof compare>
  t: Translate
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4" role="group" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {change && change.kind !== 'none' && (
        <p className="text-xs text-muted-foreground">
          {change.kind === 'new'
            ? t('analytics.change.new')
            : change.percent === 0
              ? t('analytics.change.same')
              : t(change.percent > 0 ? 'analytics.change.up' : 'analytics.change.down', { percent: Math.abs(change.percent) })}
        </p>
      )}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function DailyBars({
  title,
  buckets,
  locale,
  t,
  emptyText,
}: {
  title: string
  buckets: Bucket[]
  locale: string
  t: Translate
  emptyText: string
}) {
  const weekly = buckets.some((b) => b.start !== b.end)
  const max = niceMax(Math.max(...buckets.map((b) => b.value), 0))
  const label = (b: Bucket) => (b.start === b.end ? fmtDay(b.start, locale) : `${fmtDay(b.start, locale)} – ${fmtDay(b.end, locale)}`)
  const total = buckets.reduce((sum, b) => sum + b.value, 0)

  return (
    <figure className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{t('analytics.total', { n: total })}</span>
      </figcaption>
      {!hasActivity(buckets) ? (
        <p className="flex h-32 items-center justify-center rounded-xl bg-muted px-4 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="relative h-32" aria-hidden>
            <span className="absolute -top-1 left-0 text-[10px] text-muted-foreground tabular-nums">{max}</span>
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            <div className="absolute inset-0 flex items-end gap-[2px] border-b border-border pl-6">
              {buckets.map((b) => (
                <div
                  key={b.start}
                  title={`${label(b)}: ${b.value}`}
                  className="group relative flex h-full flex-1 items-end"
                >
                  <div
                    className={cn('w-full rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80', b.value === 0 && 'opacity-0')}
                    style={{ height: `${(b.value / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between pl-6 text-[10px] text-muted-foreground" aria-hidden>
            <span>{fmtDay(buckets[0].start, locale)}</span>
            {weekly && <span>{t('analytics.byWeek')}</span>}
            <span>{fmtDay(buckets[buckets.length - 1].end, locale)}</span>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer py-1 text-muted-foreground">{t('analytics.showTable')}</summary>
            <table className="mt-2 w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">{weekly ? t('analytics.week') : t('analytics.day')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{title}</th>
                </tr>
              </thead>
              <tbody>
                {buckets.filter((b) => b.value > 0).map((b) => (
                  <tr key={b.start} className="border-t border-border">
                    <td className="py-1">{label(b)}</td>
                    <td className="py-1 text-right tabular-nums">{b.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  )
}

/** Horizontal bars for a breakdown (one series, labels and values always visible). */
export function BarList({ title, rows, emptyText }: { title: string; rows: { key: string; label: string; value: number }[]; emptyText: string }) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const max = Math.max(...sorted.map((r) => r.value), 1)
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>{row.label}</span>
                <span className="font-semibold tabular-nums">{row.value}</span>
              </div>
              <div className="h-2 rounded-full bg-muted" aria-hidden>
                <div className="h-2 rounded-full bg-chart-1" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
