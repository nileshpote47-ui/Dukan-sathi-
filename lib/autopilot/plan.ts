import { AUTOPILOT_DAYS, AUTOPILOT_LEAD_MINUTES } from '@/lib/config/autopilot'
import type { ExampleGroup } from '@/lib/config/category-examples'
import { CATEGORY_IDEAS, FESTIVALS, type FestivalSlug } from '@/lib/config/festivals'
import type { QuickCreateType } from '@/lib/config/content'
import { daysBetween } from '@/lib/ideas/today'
import { weekKeys } from '@/lib/ideas/week'

/*
 * Pure planning for Autopilot: the week (Monday, India time), the post times still ahead, and which idea each
 * post uses — festivals of the week (and the next few days) first, then the shop category's everyday ideas.
 */

export type AutopilotIdea =
  | { kind: 'festival'; slug: FestivalSlug; type: QuickCreateType; date: string }
  | { kind: 'category'; group: ExampleGroup; n: number; type: QuickCreateType }

/** Monday "YYYY-MM-DD" of the IST week containing todayKey. */
export const weekStartOf = (todayKey: string) => weekKeys(todayKey)[0]

/** Planned times (ISO, UTC) for up to `count` posts this week, on the Autopilot days, still ahead of `now`. */
export function plannedSlots(weekStart: string, postTime: string, count: number, now: Date): string[] {
  const hhmm = postTime.slice(0, 5)
  const earliest = now.getTime() + AUTOPILOT_LEAD_MINUTES * 60_000
  const out: string[] = []
  for (const offset of AUTOPILOT_DAYS) {
    if (out.length >= count) break
    const day = new Date(Date.parse(`${weekStart}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
    const at = new Date(`${day}T${hhmm}:00+05:30`)
    if (at.getTime() >= earliest) out.push(at.toISOString())
  }
  return out.sort()
}

/** Ideas for this week's posts: festivals from Monday to 3 days after Sunday first, then category ideas. */
export function weekIdeas(weekStart: string, group: ExampleGroup, count: number): AutopilotIdea[] {
  const festivals: AutopilotIdea[] = FESTIVALS.filter((f) => !f.groups || f.groups.includes(group))
    .filter((f) => {
      const d = daysBetween(weekStart, f.date)
      return d >= 0 && d <= 9
    })
    .map((f) => ({ kind: 'festival', slug: f.slug, type: f.type, date: f.date }))
  const pool = CATEGORY_IDEAS[group]
  const weekNumber = Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / (7 * 86_400_000))
  const category: AutopilotIdea[] = pool.map((_, i) => {
    const idea = pool[(weekNumber + i) % pool.length]
    return { kind: 'category', group, n: idea.n, type: idea.type }
  })
  const ideas = [...festivals, ...category]
  // More posts than ideas: repeat the category ideas (each post still gets its own AI copy).
  return Array.from({ length: count }, (_, i) => ideas[i % ideas.length])
}
