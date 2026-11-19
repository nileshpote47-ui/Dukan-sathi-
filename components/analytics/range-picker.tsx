import Link from 'next/link'
import { RANGE_PRESETS, type DateRange } from '@/lib/analytics/range'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/** Range presets as links (work without JavaScript) + a custom from/to form (India days). */
export function RangePicker({ basePath, range, t, today }: { basePath: string; range: DateRange; t: Translate; today: string }) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label={t('analytics.range.label')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {RANGE_PRESETS.filter((p) => p !== 'CUSTOM').map((preset) => (
          <Link
            key={preset}
            href={`${basePath}?range=${preset}`}
            aria-current={range.preset === preset ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold',
              range.preset === preset ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted',
            )}
          >
            {t(`analytics.range.${preset}` as MessageKey)}
          </Link>
        ))}
      </nav>
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2" aria-label={t('analytics.range.CUSTOM')}>
        <input type="hidden" name="range" value="CUSTOM" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('analytics.range.from')}</span>
          <input type="date" name="from" required max={today} defaultValue={range.fromDay} className="min-h-11 rounded-xl border border-input bg-card px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('analytics.range.to')}</span>
          <input type="date" name="to" required max={today} defaultValue={range.toDay} className="min-h-11 rounded-xl border border-input bg-card px-3" />
        </label>
        <button type="submit" className="min-h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted">
          {t('analytics.range.apply')}
        </button>
      </form>
    </div>
  )
}
