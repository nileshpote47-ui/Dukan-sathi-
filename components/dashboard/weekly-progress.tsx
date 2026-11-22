import { Check } from 'lucide-react'
import type { WeeklyProgress } from '@/lib/ideas/week'
import type { Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/*
 * "This week": Monday–Sunday in IST, a filled day when the owner created something that
 * day, plus real counts of content made and posts published. No targets are invented.
 */
export function WeeklyProgressStrip({ progress, t, locale }: { progress: WeeklyProgress; t: Translate; locale: string }) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' })
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
  const empty = progress.created === 0

  return (
    <section aria-labelledby="week-title" className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="week-title" className="font-display text-lg font-bold">
          {t('progress.title')}
        </h2>
        <p className="text-sm font-medium tabular-nums">{t('progress.summary', { created: progress.created, published: progress.published })}</p>
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {progress.days.map((day) => {
          const date = new Date(`${day.key}T00:00:00Z`)
          const label = t(day.made ? 'progress.dayMade' : 'progress.dayNone', { day: dayName.format(date) })
          return (
            <li key={day.key} className="flex flex-col items-center gap-1" aria-label={label} title={label}>
              <span
                aria-hidden
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 text-sm',
                  day.made ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted',
                  day.future && 'border-dashed bg-card',
                  day.today && !day.made && 'border-primary',
                )}
              >
                {day.made && <Check className="size-4" />}
              </span>
              <span aria-hidden className={cn('text-xs', day.today ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                {weekday.format(date)}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">{t(empty ? 'progress.empty' : 'progress.good')}</p>
    </section>
  )
}
