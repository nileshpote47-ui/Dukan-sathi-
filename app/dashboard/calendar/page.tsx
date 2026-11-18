import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarItem } from '@/components/content/calendar-item'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getScheduledBetween, getUpcomingScheduled, type ContentSummary } from '@/lib/data/content'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import {
  addMonths,
  intlLocale,
  istDateKey,
  monthGrid,
  monthRangeIso,
  parseYearMonth,
  yearMonthKey,
  type YearMonth,
} from '@/lib/utils/datetime'

export const metadata: Metadata = { title: 'Calendar' }

const href = (ym: YearMonth, day?: string) => `/dashboard/calendar?month=${yearMonthKey(ym)}${day ? `&day=${day}` : ''}`

/**
 * Simple month calendar built from links (no client JavaScript, no calendar library).
 * Shows content by its planned date (scheduled_for) in India time.
 */
export default async function CalendarPage({ searchParams }: PageProps<'/dashboard/calendar'>) {
  const [{ profile }, params] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const ym = parseYearMonth(first(params.month))
  const today = istDateKey(new Date())
  const rawDay = first(params.day)
  const selectedDay = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) && rawDay.startsWith(yearMonthKey(ym)) ? rawDay : undefined

  const range = monthRangeIso(ym)
  const [monthItems, upcoming] = await Promise.all([
    getScheduledBetween(range.start, range.end),
    getUpcomingScheduled(new Date().toISOString(), 10),
  ])

  const byDay = new Map<string, ContentSummary[]>()
  for (const item of monthItems) {
    if (!item.scheduled_for) continue
    const key = istDateKey(item.scheduled_for)
    byDay.set(key, [...(byDay.get(key) ?? []), item])
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(ym.year, ym.month - 1, 1)),
  )
  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
  const selectedItems = selectedDay ? (byDay.get(selectedDay) ?? []) : []

  return (
    <>
      <PageHeader title={t('calendar.title')} description={t('calendar.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href={href(addMonths(ym, -1))}
              aria-label={t('calendar.prevMonth')}
              className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </Link>
            <h2 className="text-lg font-semibold" aria-live="polite">
              {monthLabel}
            </h2>
            <Link
              href={href(addMonths(ym, 1))}
              aria-label={t('calendar.nextMonth')}
              className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          </div>

          <table className="w-full table-fixed border-separate border-spacing-1">
            <caption className="sr-only">{monthLabel}</caption>
            <thead>
              <tr>
                {Array.from({ length: 7 }, (_, i) => (
                  <th key={i} scope="col" className="pb-1 text-xs font-medium text-muted-foreground">
                    {t(`calendar.weekday.${i}` as MessageKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(ym).map((week) => (
                <tr key={week[0].key}>
                  {week.map((day) => {
                    const count = byDay.get(day.key)?.length ?? 0
                    const selected = day.key === selectedDay
                    const isToday = day.key === today
                    const label = [dayLabel(day.key), count ? t('calendar.itemCount', { count }) : '', isToday ? t('calendar.today') : '']
                      .filter(Boolean)
                      .join(', ')
                    return (
                      <td key={day.key} className="p-0">
                        {day.inMonth ? (
                          <Link
                            href={href(ym, day.key)}
                            aria-label={label}
                            aria-current={selected ? 'date' : undefined}
                            className={cn(
                              'flex h-12 flex-col items-center justify-center rounded-xl text-sm transition focus-visible:outline-2 focus-visible:outline-ring sm:h-16',
                              selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                              isToday && !selected && 'ring-2 ring-primary ring-inset',
                            )}
                          >
                            <span className={cn('font-medium', count > 0 && !selected && 'text-primary')}>{day.day}</span>
                            {count > 0 && (
                              <span
                                aria-hidden
                                className={cn(
                                  'mt-0.5 min-w-5 rounded-full px-1 text-[11px] leading-4 font-semibold',
                                  selected ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <span aria-hidden className="flex h-12 items-center justify-center text-sm text-muted-foreground/40 sm:h-16">
                            {day.day}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted-foreground">{t('publishing.notice')}</p>
        </Card>

        <div className="flex flex-col gap-4">
          {selectedDay && (
            <Card>
              <CardTitle className="text-base">{t('calendar.itemsOn', { date: dayLabel(selectedDay) })}</CardTitle>
              {selectedItems.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t('calendar.nothingOnDay')}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {selectedItems.map((item) => (
                    <li key={item.id}>
                      <CalendarItem item={item} t={t} locale={locale} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardTitle className="text-base">{t('calendar.upcoming')}</CardTitle>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarX2} title={t('calendar.emptyTitle')} body={t('calendar.emptyBody')} className="px-2 py-6" />
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <CalendarItem item={item} t={t} locale={locale} showDate />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
