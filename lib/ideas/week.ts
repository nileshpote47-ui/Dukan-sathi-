import { istDateKey } from '@/lib/utils/datetime'
import { daysBetween } from './today'

/* Monday–Sunday week in IST for the dashboard's "This week" strip (pure helpers). */

export interface WeekDay {
  key: string
  made: boolean
  today: boolean
  future: boolean
}

export interface WeeklyProgress {
  days: WeekDay[]
  created: number
  published: number
}

/** "YYYY-MM-DD" keys Monday..Sunday of the IST week containing todayKey. */
export function weekKeys(todayKey: string): string[] {
  const today = new Date(`${todayKey}T00:00:00Z`)
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000)
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10))
}

export function buildWeek(todayKey: string, createdAt: string[]): WeekDay[] {
  const made = new Set(createdAt.map((iso) => istDateKey(iso)))
  return weekKeys(todayKey).map((key) => ({ key, made: made.has(key), today: key === todayKey, future: daysBetween(todayKey, key) > 0 }))
}

