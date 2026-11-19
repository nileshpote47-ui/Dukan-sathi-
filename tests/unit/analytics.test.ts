import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { csvCell, toCsv } from '@/lib/analytics/csv'
import { buildInsights } from '@/lib/analytics/insights'
import { compare, defaultRange, istDay, rangeQuery, resolveRange, successRate } from '@/lib/analytics/range'
import { bucketSeries, hasActivity, niceMax } from '@/lib/analytics/series'
import type { BusinessAnalytics, PlanUsageRow } from '@/lib/analytics/types'
import { MetaConnector, facebookMetrics, instagramMetrics } from '@/services/publishing/providers/meta'

// 2026-11-19 20:00 UTC = 2026-11-20 01:30 in India: "today" is already the 20th there.
const NOW = new Date('2026-11-19T20:00:00Z')

describe('date ranges (India days)', () => {
  it('uses the India calendar day, not the UTC day', () => {
    expect(istDay(NOW)).toBe('2026-11-20')
    const today = resolveRange({ preset: 'TODAY' }, NOW)
    expect(today.ok && today.range.from.toISOString()).toBe('2026-11-19T18:30:00.000Z')
    expect(today.ok && today.range.to.toISOString()).toBe('2026-11-20T18:30:00.000Z')
    expect(today.ok && today.range.days).toBe(1)
  })

  it('resolves presets including today, never past the end of today', () => {
    const r7 = resolveRange({ preset: 'LAST_7_DAYS' }, NOW)
    expect(r7.ok && [r7.range.fromDay, r7.range.toDay, r7.range.days]).toEqual(['2026-11-14', '2026-11-20', 7])
    const r90 = resolveRange({ preset: 'LAST_90_DAYS' }, NOW)
    expect(r90.ok && r90.range.days).toBe(90)
    const month = resolveRange({ preset: 'THIS_MONTH' }, NOW)
    expect(month.ok && [month.range.fromDay, month.range.toDay]).toEqual(['2026-11-01', '2026-11-20'])
    const last = resolveRange({ preset: 'LAST_MONTH' }, NOW)
    expect(last.ok && [last.range.fromDay, last.range.toDay, last.range.days]).toEqual(['2026-10-01', '2026-10-31', 31])
    const jan = resolveRange({ preset: 'LAST_MONTH' }, new Date('2027-01-10T06:00:00Z'))
    expect(jan.ok && [jan.range.fromDay, jan.range.toDay]).toEqual(['2026-12-01', '2026-12-31'])
  })

  it('falls back to the last 30 days for unknown presets', () => {
    const r = resolveRange({ preset: 'FOREVER' }, NOW)
    expect(r.ok && [r.range.preset, r.range.days]).toEqual(['LAST_30_DAYS', 30])
    expect(defaultRange(NOW).fromDay).toBe('2026-10-22')
  })

  it('validates custom ranges', () => {
    expect(resolveRange({ preset: 'CUSTOM', from: '2026-11-01', to: '2026-11-10' }, NOW)).toMatchObject({ ok: true, range: { days: 10 } })
    expect(resolveRange({ preset: 'CUSTOM', from: '2026-11-10', to: '2026-11-01' }, NOW)).toEqual({ ok: false, error: 'order' })
    expect(resolveRange({ preset: 'CUSTOM', from: '2026-11-01', to: '2026-11-21' }, NOW)).toEqual({ ok: false, error: 'future' })
    expect(resolveRange({ preset: 'CUSTOM', from: '2025-01-01', to: '2026-11-01' }, NOW)).toEqual({ ok: false, error: 'too_long' })
    expect(resolveRange({ preset: 'CUSTOM', from: '2026-02-30', to: '2026-03-01' }, NOW)).toEqual({ ok: false, error: 'invalid' })
    expect(resolveRange({ preset: 'CUSTOM', from: 'yesterday', to: '2026-11-01' }, NOW)).toEqual({ ok: false, error: 'invalid' })
    const custom = resolveRange({ preset: 'CUSTOM', from: '2026-11-01', to: '2026-11-10' }, NOW)
    expect(custom.ok && rangeQuery(custom.range)).toBe('range=CUSTOM&from=2026-11-01&to=2026-11-10')
  })

  it('never shows a percentage change from an empty period', () => {
    expect(compare(0, 0)).toEqual({ kind: 'none' })
    expect(compare(5, 0)).toEqual({ kind: 'new' })
    expect(compare(6, 4)).toEqual({ kind: 'change', percent: 50 })
    expect(compare(2, 4)).toEqual({ kind: 'change', percent: -50 })
  })

  it('has no success rate when nothing finished', () => {
    expect(successRate(0, 0)).toBeNull()
    expect(successRate(3, 1)).toBe(75)
  })
})

describe('chart series', () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => ({ day: `d${String(i).padStart(3, '0')}`, created: i % 3 === 0 ? 1 : 0, published: 0, ai: 0 }))

  it('shows days up to 62, weeks beyond', () => {
    expect(bucketSeries(days(30), 'created')).toHaveLength(30)
    const weeks = bucketSeries(days(90), 'created')
    expect(weeks).toHaveLength(13)
    expect(weeks.reduce((s, b) => s + b.value, 0)).toBe(30)
    expect(weeks[0]).toMatchObject({ start: 'd000', end: 'd006' })
  })

  it('treats an all-zero series as "no activity" (empty state, not invented bars)', () => {
    expect(hasActivity(bucketSeries(days(10), 'published'))).toBe(false)
    expect(hasActivity(bucketSeries(days(10), 'created'))).toBe(true)
  })

  it('rounds the axis to a readable maximum', () => {
    expect([niceMax(0), niceMax(1), niceMax(3), niceMax(7), niceMax(12), niceMax(230)]).toEqual([1, 1, 5, 10, 20, 500])
  })
})

const base = (): BusinessAnalytics => ({
  content: { created: 0, created_previous: 0, by_status: {}, by_type: {}, by_language: {}, now: { total: 0, draft: 0, ready: 0, scheduled_upcoming: 0, published: 0 } },
  publishing: { published: 0, failed: 0, cancelled: 0, pending: 0, published_previous: 0, upcoming: 0, by_channel: [], avg_delay_seconds: null, recent_failures: [], whatsapp: { sent: 0, delivered: 0, read: 0, failed: 0 } },
  daily: [],
  usage: {},
  media: { created: 0, ai_generated: 0, uploaded: 0, posters: 0, failed: 0 },
  channels: { connected: {}, needs_attention: 0 },
  top_content: [],
  recent_published: [],
  metrics_refreshed_at: null,
})

describe('insights (deterministic, from real numbers only)', () => {
  const keys = (d: BusinessAnalytics, usage: PlanUsageRow[] = []) => buildInsights(d, usage, 20).map((i) => i.key)

  it('says nothing invented for an empty business except the missing channel', () => {
    expect(keys(base())).toEqual(['analytics.insight.noChannels'])
  })

  it('points out ready content that is not scheduled, mostly drafts and upcoming posts', () => {
    const d = base()
    d.channels.connected = { FACEBOOK: 1 }
    d.content.now = { total: 10, draft: 6, ready: 8, scheduled_upcoming: 1, published: 0 }
    d.publishing.upcoming = 1
    const insights = buildInsights(d, [], 20)
    expect(insights.find((i) => i.key === 'analytics.insight.readyNotScheduled')?.values).toEqual({ ready: 8, scheduled: 2 })
    expect(insights.map((i) => i.key)).toContain('analytics.insight.mostlyDrafts')
    expect(insights.map((i) => i.key)).toContain('analytics.insight.upcoming')
  })

  it('compares publishing only against a non-empty previous period', () => {
    const d = base()
    d.channels.connected = { INSTAGRAM: 1 }
    d.publishing.published = 4
    expect(keys(d)).not.toContain('analytics.insight.publishedMore')
    d.publishing.published_previous = 2
    expect(keys(d)).toContain('analytics.insight.publishedMore')
  })

  it('names the top channel / format only when there is a clear leader', () => {
    const d = base()
    d.channels.connected = { FACEBOOK: 1, INSTAGRAM: 1 }
    d.publishing.by_channel = [{ channel: 'FACEBOOK', published: 2, failed: 0, cancelled: 0 }, { channel: 'INSTAGRAM', published: 2, failed: 0, cancelled: 0 }]
    expect(keys(d)).not.toContain('analytics.insight.topChannel')
    d.publishing.by_channel[1].published = 1
    expect(buildInsights(d, [], 20).find((i) => i.key === 'analytics.insight.topChannel')?.translate).toEqual({ channel: 'publishing.channel.FACEBOOK' })
    d.content.created = 4
    d.content.by_type = { OFFER: 3, POST: 1 }
    expect(keys(d)).toContain('analytics.insight.topFormat')
  })

  it('warns near a plan limit using the Phase 5 numbers', () => {
    const d = base()
    d.channels.connected = { FACEBOOK: 1 }
    const usage = [{ feature_key: 'ai_text_generation', monthly_limit: 30, used: 28, reserved: 0, remaining: 2, period_start: '2026-11-01' }] as PlanUsageRow[]
    expect(buildInsights(d, usage, 20)[0]).toMatchObject({ key: 'analytics.insight.nearLimit', values: { used: 28, limit: 30 } })
  })
})

describe('CSV export', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+91 98765')).toBe("'+91 98765")
    expect(csvCell(null)).toBe('')
    expect(toCsv(['a', 'b'], [[1, 'दिवाळी']])).toBe('﻿a,b\r\n1,दिवाळी\r\n')
  })
})

describe('platform engagement (Meta)', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_ID', '123')
    vi.stubEnv('META_APP_SECRET', 'app-secret')
    vi.stubEnv('META_LOGIN_CONFIG_ID', '456')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const target = (channel: 'INSTAGRAM' | 'FACEBOOK') => ({ accountId: 'a', channel, externalId: 'x', parentId: null, metadata: {} })
  const stub = (status: number, body: unknown) => {
    const calls: URL[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      calls.push(new URL(input))
      return new Response(JSON.stringify(body), { status })
    })
    return calls
  }

  it('reads only numbers the API returned (missing stays missing)', () => {
    expect(instagramMetrics({ like_count: 12, comments_count: 3 })).toEqual({ likes: 12, comments: 3 })
    expect(instagramMetrics({ comments_count: 3 })).toEqual({ comments: 3 })
    expect(facebookMetrics({ reactions: { summary: { total_count: 9 } }, comments: { summary: { total_count: 1 } }, shares: { count: 2 } })).toEqual({ reactions: 9, comments: 1, shares: 2 })
    expect(facebookMetrics({ reactions: { summary: { total_count: 'many' } } })).toEqual({})
  })

  it('fetches many posts of one account in a single call', async () => {
    const calls = stub(200, { m1: { like_count: 5, comments_count: 1, id: 'm1' }, m2: { like_count: 0, comments_count: 0, id: 'm2' } })
    const result = await new MetaConnector().getContentMetrics(target('INSTAGRAM'), { accessToken: 't' }, ['m1', 'm2', 'm3'])
    expect(calls).toHaveLength(1)
    expect(calls[0].searchParams.get('ids')).toBe('m1,m2,m3')
    expect(calls[0].searchParams.get('fields')).toBe('like_count,comments_count')
    expect(calls[0].toString()).not.toContain('access_token')
    expect(result).toEqual({
      m1: { status: 'OK', metrics: { likes: 5, comments: 1 } },
      m2: { status: 'OK', metrics: { likes: 0, comments: 0 } },
      m3: { status: 'NOT_FOUND', metrics: {} },
    })
  })

  it.each([
    [400, { error: { code: 10, message: 'Permission denied' } }, 'PERMISSION_DENIED'],
    [400, { error: { code: 190, message: 'Token expired' } }, 'PERMISSION_DENIED'],
    [400, { error: { code: 4, message: 'Rate limit' } }, 'RATE_LIMITED'],
    [500, 'not json at all', 'ERROR'],
  ])('maps a %s provider answer to %j → %s without inventing numbers', async (status, body, expected) => {
    stub(status, body)
    const result = await new MetaConnector().getContentMetrics(target('FACEBOOK'), { accessToken: 't' }, ['p1'])
    expect(result.p1).toEqual({ status: expected, metrics: {} })
  })

  it('reports an unreachable platform as an error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const result = await new MetaConnector().getContentMetrics(target('FACEBOOK'), { accessToken: 't' }, ['p1'])
    expect(result.p1.status).toBe('ERROR')
  })
})
