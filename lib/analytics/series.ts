import type { DailyPoint } from './types'

/*
 * Chart buckets. Up to 62 days are shown day by day; longer ranges are grouped into weeks
 * (7 India days from the range start) so bars stay readable on a phone.
 */

export interface Bucket {
  /** First India day of the bucket (YYYY-MM-DD). */
  start: string
  /** Last India day of the bucket. */
  end: string
  value: number
}

export function bucketSeries(points: DailyPoint[], key: 'created' | 'published' | 'ai', maxDaily = 62): Bucket[] {
  if (points.length <= maxDaily) return points.map((p) => ({ start: p.day, end: p.day, value: p[key] }))
  const out: Bucket[] = []
  for (let i = 0; i < points.length; i += 7) {
    const week = points.slice(i, i + 7)
    out.push({ start: week[0].day, end: week[week.length - 1].day, value: week.reduce((sum, p) => sum + p[key], 0) })
  }
  return out
}

/** True when the series has at least one non-zero value (otherwise show an empty state, not a flat chart). */
export const hasActivity = (buckets: Bucket[]) => buckets.some((b) => b.value > 0)

/** A "nice" axis maximum (1, 2, 5 × 10ⁿ) at or above the largest value. */
export function niceMax(value: number): number {
  if (value <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power
  return 10 * power
}
