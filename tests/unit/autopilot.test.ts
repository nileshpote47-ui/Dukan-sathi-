import { describe, expect, it, vi } from 'vitest'
import { plannedSlots, weekIdeas, weekStartOf } from '@/lib/autopilot/plan'
import { AUTOPILOT_CHANNELS, AUTOPILOT_TIMES } from '@/lib/config/autopilot'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'
import { autopilotSettingsSchema } from '@/lib/validation/autopilot'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
const { ideaText } = await import('@/lib/autopilot/generator')

describe('Autopilot week planning', () => {
  it('weeks start on Monday (India time)', () => {
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16') // Sunday
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23') // Monday
  })

  it('plans posts at the chosen India time on Mon, Tue, Thu, Fri, Sat', () => {
    const monday0600 = new Date('2026-11-23T00:30:00Z') // 06:00 IST Monday
    const slots = plannedSlots('2026-11-23', '10:00', 5, monday0600)
    expect(slots).toEqual([
      '2026-11-23T04:30:00.000Z',
      '2026-11-24T04:30:00.000Z',
      '2026-11-26T04:30:00.000Z',
      '2026-11-27T04:30:00.000Z',
      '2026-11-28T04:30:00.000Z',
    ])
  })

  it('skips times that have passed (or are too close) and uses the rest of the week', () => {
    const thursdayNoon = new Date('2026-11-26T06:30:00Z') // 12:00 IST Thursday
    const slots = plannedSlots('2026-11-23', '10:00', 5, thursdayNoon)
    expect(slots).toEqual(['2026-11-27T04:30:00.000Z', '2026-11-28T04:30:00.000Z', '2026-11-29T04:30:00.000Z'])
    expect(plannedSlots('2026-11-23', '10:00', 5, new Date('2026-11-30T00:00:00Z'))).toEqual([])
  })

  it('puts the week\'s festivals first, then ideas for the shop, one per post', () => {
    const ideas = weekIdeas('2026-12-28', 'grocery', 5) // New Year on Friday 1 Jan
    expect(ideas[0]).toMatchObject({ kind: 'festival', slug: 'new_year' })
    expect(ideas.slice(1).every((i) => i.kind === 'category' && i.group === 'grocery')).toBe(true)
    // Festivals up to 3 days after Sunday count for this week (posts go out before the day).
    expect(weekIdeas('2027-01-11', 'food', 5).slice(0, 1)).toMatchObject([{ slug: 'makar_sankranti' }])
    expect(ideas).toHaveLength(5)
    expect(weekIdeas('2027-06-07', 'mobile', 5).every((i) => i.kind === 'category')).toBe(true)
  })

  it('writes the idea in the shop\'s language and only as Post, Offer or Festival', () => {
    const festival = ideaText({ kind: 'festival', slug: 'diwali', type: 'OFFER', date: '2027-10-29' }, 'mr')
    expect(festival.title).toContain('दिवाळी')
    expect(festival.brief).toContain('दिवाळी')
    expect(festival.type).toBe('OFFER')
    expect(ideaText({ kind: 'category', group: 'food', n: 1, type: 'REEL' }, 'en').type).toBe('POST')
  })
})

describe('Autopilot settings and texts', () => {
  it('accepts only known times, own account ids and short offers', () => {
    const id = crypto.randomUUID()
    expect(autopilotSettingsSchema.safeParse({ enabled: true, accountIds: [id], postTime: '10:00', ownerOffers: 'Cashews ₹899/kg' }).success).toBe(true)
    expect(autopilotSettingsSchema.safeParse({ enabled: true, accountIds: [id], postTime: '03:00' }).success).toBe(false)
    expect(autopilotSettingsSchema.safeParse({ enabled: true, accountIds: [id, id], postTime: '10:00' }).success).toBe(false)
    expect(autopilotSettingsSchema.safeParse({ enabled: true, accountIds: [], postTime: '10:00', ownerOffers: 'x'.repeat(301) }).success).toBe(false)
    expect(autopilotSettingsSchema.parse({ enabled: false, accountIds: [], postTime: '10:00', owner_id: 'x' })).not.toHaveProperty('owner_id')
    expect(AUTOPILOT_TIMES).toContain('10:00')
    expect([...AUTOPILOT_CHANNELS]).toEqual(['FACEBOOK', 'INSTAGRAM'])
  })

  it('has every Autopilot text in Marathi and Hindi', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('autopilot.') || k === 'nav.autopilot' || k.startsWith('dashboard.autopilot') || k === 'billing.autopilot')
    expect(keys.length).toBeGreaterThan(35)
    for (const dict of [mr, hi] as Record<string, string>[]) for (const key of keys) expect(dict[key], key).toBeTruthy()
  })
})
