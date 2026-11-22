import { describe, expect, it } from 'vitest'
import { EXAMPLE_GROUPS } from '@/lib/config/category-examples'
import { QUICK_CREATE_TYPES } from '@/lib/config/content'
import { CALENDAR_COVERS_UNTIL, CATEGORY_IDEAS, FESTIVAL_LOOKAHEAD_DAYS, FESTIVAL_SLUGS, FESTIVALS } from '@/lib/config/festivals'
import { createTranslator } from '@/lib/i18n'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'
import { presentIdeas } from '@/lib/ideas/present'
import { daysBetween, ideasForToday } from '@/lib/ideas/today'
import { buildWeek, weekKeys } from '@/lib/ideas/week'

describe('festival calendar', () => {
  it('has valid, ordered, unique dates within the covered range', () => {
    const dates = FESTIVALS.map((f) => f.date)
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date)
      expect(date <= CALENDAR_COVERS_UNTIL).toBe(true)
    }
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(FESTIVALS.map((f) => f.slug)).size).toBe(FESTIVALS.length)
    expect(FESTIVALS.map((f) => f.slug).sort()).toEqual([...FESTIVAL_SLUGS].sort())
  })

  it('uses only composer types and known shop groups', () => {
    for (const f of FESTIVALS) {
      expect(QUICK_CREATE_TYPES).toContain(f.type)
      for (const group of f.groups ?? []) expect(EXAMPLE_GROUPS).toContain(group)
    }
    for (const group of EXAMPLE_GROUPS) {
      expect(CATEGORY_IDEAS[group].length).toBeGreaterThanOrEqual(2)
      for (const idea of CATEGORY_IDEAS[group]) expect(QUICK_CREATE_TYPES).toContain(idea.type)
    }
  })

  it('names every festival and idea in English, Marathi and Hindi', () => {
    const keys = [
      ...FESTIVAL_SLUGS.map((slug) => `festival.${slug}`),
      ...EXAMPLE_GROUPS.flatMap((group) => CATEGORY_IDEAS[group].flatMap(({ n }) => [`ideas.${group}.${n}.title`, `ideas.${group}.${n}.brief`])),
    ]
    for (const dict of [en, mr, hi] as Record<string, string>[]) for (const key of keys) expect(dict[key], key).toBeTruthy()
  })
})

describe('ideas for today', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-12-24', '2026-12-25')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2027-03-01', '2027-03-01')).toBe(0)
  })

  it('suggests the nearest upcoming festivals first, then category ideas', () => {
    const ideas = ideasForToday('2026-12-20', 'grocery')
    expect(ideas[0]).toMatchObject({ kind: 'festival', slug: 'christmas', daysAway: 5 })
    expect(ideas[1]).toMatchObject({ kind: 'festival', slug: 'new_year', daysAway: 12 })
    expect(ideas.slice(2).every((idea) => idea.kind === 'category' && idea.group === 'grocery')).toBe(true)
    expect(ideas).toHaveLength(4)
  })

  it('includes a festival on its own day but not after it or beyond the look-ahead', () => {
    expect(ideasForToday('2026-12-25', 'food')[0]).toMatchObject({ slug: 'christmas', daysAway: 0 })
    expect(ideasForToday('2026-12-26', 'food').some((i) => i.kind === 'festival' && i.slug === 'christmas')).toBe(false)
    const quiet = ideasForToday('2027-06-01', 'food')
    expect(quiet.every((idea) => idea.kind === 'category')).toBe(true)
    expect(daysBetween('2027-06-01', '2027-08-15')).toBeGreaterThan(FESTIVAL_LOOKAHEAD_DAYS)
  })

  it('respects festival groups (Dhanteras not for grocery shops)', () => {
    expect(ideasForToday('2027-10-20', 'grocery').some((i) => i.kind === 'festival' && i.slug === 'dhanteras')).toBe(false)
    expect(ideasForToday('2027-10-20', 'fashion').some((i) => i.kind === 'festival' && i.slug === 'dhanteras')).toBe(true)
  })

  it('rotates category ideas day by day without repeating on the same day', () => {
    const a = ideasForToday('2027-06-01', 'mobile')
    const b = ideasForToday('2027-06-02', 'mobile')
    expect(a).not.toEqual(b)
    expect(new Set(a.map((i) => (i.kind === 'category' ? i.n : 0))).size).toBe(a.length)
  })

  it('still gives ideas after the calendar ends', () => {
    expect(ideasForToday('2030-01-01', 'general').length).toBeGreaterThan(0)
  })

  it('translates cards; festival ideas fill the composer with the festival name', () => {
    const cards = presentIdeas(ideasForToday('2026-12-24', 'grocery'), createTranslator({ ...en, ...mr }))
    expect(cards[0]).toMatchObject({ festival: true, badge: 'उद्या', type: 'FESTIVAL' })
    expect(cards[0].brief).toContain('नाताळ')
    expect(cards[0].title).toContain('नाताळ')
    const english = presentIdeas(ideasForToday('2026-12-15', 'grocery'), createTranslator(en))
    expect(english[0].badge).toBe('In 10 days')
    expect(english.at(-1)).toMatchObject({ festival: false, badge: 'For your shop' })
    expect(english.every((card) => card.brief.length >= 5)).toBe(true)
  })
})

describe('this week', () => {
  it('runs Monday to Sunday in IST', () => {
    expect(weekKeys('2026-11-22')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(weekKeys('2026-11-23')[0]).toBe('2026-11-23')
  })

  it('marks the days something was made, using the IST calendar day', () => {
    // 20:00 UTC on the 17th is 01:30 IST on the 18th.
    const week = buildWeek('2026-11-19', ['2026-11-17T20:00:00Z', '2026-11-16T05:00:00Z'])
    expect(week.filter((d) => d.made).map((d) => d.key)).toEqual(['2026-11-16', '2026-11-18'])
    expect(week.find((d) => d.today)?.key).toBe('2026-11-19')
    expect(week.filter((d) => d.future).map((d) => d.key)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
  })
})
