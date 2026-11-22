import type { QuickCreateType } from '@/lib/config/content'
import type { ExampleGroup } from '@/lib/config/category-examples'
import {
  CATEGORY_IDEAS,
  CATEGORY_IDEAS_SHOWN,
  FESTIVAL_LOOKAHEAD_DAYS,
  FESTIVALS,
  MAX_FESTIVAL_IDEAS,
  type FestivalSlug,
} from '@/lib/config/festivals'

/*
 * "Ideas for today": upcoming festivals (from the curated calendar) first, then everyday
 * ideas for the shop's category, rotated by the day so the dashboard changes daily.
 * Pure function of the IST date and the shop group — no AI call, no database.
 */

export type Idea =
  | { kind: 'festival'; slug: FestivalSlug; daysAway: number; type: QuickCreateType }
  | { kind: 'category'; group: ExampleGroup; n: number; type: QuickCreateType }

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from one "YYYY-MM-DD" to another (both calendar days, no time zone drift). */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS)
}

export function ideasForToday(todayKey: string, group: ExampleGroup): Idea[] {
  const festivals: Idea[] = FESTIVALS.filter((f) => !f.groups || f.groups.includes(group))
    .map((f) => ({ f, days: daysBetween(todayKey, f.date) }))
    .filter(({ days }) => days >= 0 && days <= FESTIVAL_LOOKAHEAD_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, MAX_FESTIVAL_IDEAS)
    .map(({ f, days }) => ({ kind: 'festival', slug: f.slug, daysAway: days, type: f.type }))

  const pool = CATEGORY_IDEAS[group]
  const dayNumber = Math.floor(Date.parse(`${todayKey}T00:00:00Z`) / DAY_MS)
  const category: Idea[] = Array.from({ length: Math.min(CATEGORY_IDEAS_SHOWN, pool.length) }, (_, i) => {
    const idea = pool[(dayNumber + i) % pool.length]
    return { kind: 'category', group, n: idea.n, type: idea.type }
  })

  return [...festivals, ...category]
}
