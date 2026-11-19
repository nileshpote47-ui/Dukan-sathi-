/*
 * Analytics date ranges. One rule everywhere: days are India days (Asia/Kolkata, UTC+05:30,
 * no daylight saving). A range is half-open [from, to) in UTC instants, built from India
 * midnights, and never extends past the end of today (future days are not shown as zeros).
 * The database groups by the same India days (analytics_business_overview).
 */

export const RANGE_PRESETS = ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'CUSTOM'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]
export const DEFAULT_PRESET: RangePreset = 'LAST_30_DAYS'
export const MAX_RANGE_DAYS = 366

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface DateRange {
  preset: RangePreset
  /** Inclusive first India day, YYYY-MM-DD. */
  fromDay: string
  /** Inclusive last India day, YYYY-MM-DD. */
  toDay: string
  /** UTC instants for queries: [from, to). */
  from: Date
  to: Date
  days: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** India calendar day (YYYY-MM-DD) of an instant. */
export function istDay(date: Date): string {
  const d = new Date(date.getTime() + IST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** UTC instant of India midnight at the start of a day. */
export function istMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS)
}

export function addDays(day: string, n: number): string {
  return istDay(new Date(istMidnight(day).getTime() + n * DAY_MS))
}

const isDayString = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && istDay(istMidnight(v)) === v

function build(preset: RangePreset, fromDay: string, toDay: string): DateRange {
  const from = istMidnight(fromDay)
  const to = istMidnight(addDays(toDay, 1))
  return { preset, fromDay, toDay, from, to, days: Math.round((to.getTime() - from.getTime()) / DAY_MS) }
}

export type RangeResult = { ok: true; range: DateRange } | { ok: false; error: 'invalid' | 'future' | 'too_long' | 'order' }

/** Resolve a preset (or a custom from/to) at a given moment. */
export function resolveRange(input: { preset?: string | null; from?: string | null; to?: string | null }, now = new Date()): RangeResult {
  const today = istDay(now)
  const preset = (RANGE_PRESETS as readonly string[]).includes(input.preset ?? '') ? (input.preset as RangePreset) : DEFAULT_PRESET
  switch (preset) {
    case 'TODAY':
      return { ok: true, range: build(preset, today, today) }
    case 'LAST_7_DAYS':
      return { ok: true, range: build(preset, addDays(today, -6), today) }
    case 'LAST_30_DAYS':
      return { ok: true, range: build(preset, addDays(today, -29), today) }
    case 'LAST_90_DAYS':
      return { ok: true, range: build(preset, addDays(today, -89), today) }
    case 'THIS_MONTH':
      return { ok: true, range: build(preset, `${today.slice(0, 7)}-01`, today) }
    case 'LAST_MONTH': {
      const firstThis = `${today.slice(0, 7)}-01`
      const lastPrev = addDays(firstThis, -1)
      return { ok: true, range: build(preset, `${lastPrev.slice(0, 7)}-01`, lastPrev) }
    }
    case 'CUSTOM': {
      if (!isDayString(input.from) || !isDayString(input.to)) return { ok: false, error: 'invalid' }
      if (input.from > input.to) return { ok: false, error: 'order' }
      if (input.to > today) return { ok: false, error: 'future' }
      const range = build(preset, input.from, input.to)
      if (range.days > MAX_RANGE_DAYS) return { ok: false, error: 'too_long' }
      return { ok: true, range }
    }
  }
}

/** The default range (last 30 India days including today). */
export function defaultRange(now = new Date()): DateRange {
  const today = istDay(now)
  return build(DEFAULT_PRESET, addDays(today, -29), today)
}

/** Query string for links that keep the selected range. */
export function rangeQuery(range: DateRange): string {
  const params = new URLSearchParams({ range: range.preset })
  if (range.preset === 'CUSTOM') {
    params.set('from', range.fromDay)
    params.set('to', range.toDay)
  }
  return params.toString()
}

/**
 * Change versus the previous period of the same length. No percentage when the previous
 * period had nothing (a "+100%" from zero would be misleading).
 */
export function compare(current: number, previous: number): { kind: 'none' } | { kind: 'new' } | { kind: 'change'; percent: number } {
  if (previous === 0) return current === 0 ? { kind: 'none' } : { kind: 'new' }
  return { kind: 'change', percent: Math.round(((current - previous) / previous) * 100) }
}

/** Success rate only when something finished; null = not enough data (shown as "—"). */
export function successRate(published: number, failed: number): number | null {
  const finished = published + failed
  return finished === 0 ? null : Math.round((published / finished) * 100)
}
