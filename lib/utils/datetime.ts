import { siteConfig } from '@/lib/config/site'

/*
 * Dates are stored as UTC timestamps (timestamptz) but shown and entered in
 * Indian Standard Time. IST is UTC+05:30 all year (no daylight saving),
 * so the offset can be fixed.
 */
const IST_OFFSET = '+05:30'
const TZ = siteConfig.timeZone

const pad = (n: number) => String(n).padStart(2, '0')

function istParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** "2026-11-20T10:30" (a datetime-local value, in IST) → ISO string, or null if invalid. */
export function istInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00${IST_OFFSET}`)
  if (Number.isNaN(date.getTime())) return null
  // Reject rolled-over dates like 2026-02-31.
  if (isoToIstInput(date.toISOString()) !== value) return null
  return date.toISOString()
}

/** ISO string → "YYYY-MM-DDTHH:mm" in IST (for datetime-local inputs). */
export function isoToIstInput(iso: string): string {
  const p = istParts(new Date(iso))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** Calendar day key "YYYY-MM-DD" in IST. */
export function istDateKey(value: string | Date): string {
  const p = istParts(typeof value === 'string' ? new Date(value) : value)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function formatDateTime(iso: string, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function formatDate(iso: string, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, dateStyle: 'medium' }).format(new Date(iso))
}

export function formatTime(iso: string, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, timeStyle: 'short' }).format(new Date(iso))
}

/** Intl locale for an app language code. */
export const intlLocale = (language: string | null | undefined) =>
  language === 'mr' ? 'mr-IN' : language === 'hi' ? 'hi-IN' : 'en-IN'

// ---------------------------------------------------------------------------
// Month calendar
// ---------------------------------------------------------------------------

export interface YearMonth {
  year: number
  month: number // 1–12
}

/** "2026-11" → { year, month }, falling back to the current month in IST. */
export function parseYearMonth(value: string | undefined, now: Date = new Date()): YearMonth {
  const match = value?.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month }
  }
  const p = istParts(now)
  return { year: p.year, month: p.month }
}

export const yearMonthKey = ({ year, month }: YearMonth) => `${year}-${pad(month)}`

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** UTC instants for the start of this month and the next one, measured in IST. */
export function monthRangeIso(ym: YearMonth): { start: string; end: string } {
  const next = addMonths(ym, 1)
  return {
    start: new Date(`${yearMonthKey(ym)}-01T00:00:00${IST_OFFSET}`).toISOString(),
    end: new Date(`${yearMonthKey(next)}-01T00:00:00${IST_OFFSET}`).toISOString(),
  }
}

export interface CalendarDay {
  key: string // YYYY-MM-DD
  day: number
  inMonth: boolean
}

/** Weeks (Monday first) covering the month, padded with days from neighbouring months. */
export function monthGrid(ym: YearMonth): CalendarDay[][] {
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1))
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Monday = 0
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7
  const days: CalendarDay[] = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(Date.UTC(ym.year, ym.month - 1, 1 - lead + i))
    days.push({
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === ym.month - 1,
    })
  }
  const weeks: CalendarDay[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}
