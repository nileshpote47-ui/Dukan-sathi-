import { LOW_USAGE_SHARE } from '@/lib/config/billing'
import type { MessageKey } from '@/lib/i18n'
import type { BusinessAnalytics, PlanUsageRow } from './types'
import { compare } from './range'

/*
 * Simple, deterministic insights from the owner's own data — plain rules, no AI, no claims
 * about sales or customers. Each insight names the numbers it is based on.
 */

export interface Insight {
  key: MessageKey
  values?: Record<string, string | number>
  tone: 'info' | 'good' | 'attention'
  /** Translation key of a value that must be translated before display (e.g. a channel name). */
  translate?: Record<string, MessageKey>
}

export function buildInsights(data: BusinessAnalytics, planUsage: PlanUsageRow[], maxItems = 5): Insight[] {
  const out: Insight[] = []
  const connected = Object.values(data.channels.connected).reduce((a, b) => a + b, 0)
  const { now } = data.content

  if (connected === 0) out.push({ key: 'analytics.insight.noChannels', tone: 'attention' })
  if (data.channels.needs_attention > 0) out.push({ key: 'analytics.insight.reconnect', values: { n: data.channels.needs_attention }, tone: 'attention' })

  if (data.publishing.failed > 0) out.push({ key: 'analytics.insight.failures', values: { n: data.publishing.failed }, tone: 'attention' })

  for (const row of planUsage) {
    if (row.monthly_limit > 0 && row.remaining / row.monthly_limit < LOW_USAGE_SHARE) {
      out.push({
        key: 'analytics.insight.nearLimit',
        values: { used: row.used, limit: row.monthly_limit },
        translate: { feature: `billing.feature.${row.feature_key}` as MessageKey },
        tone: 'attention',
      })
    }
  }

  const scheduled = now.scheduled_upcoming + data.publishing.upcoming
  if (now.ready > 0 && scheduled < now.ready) {
    out.push({ key: 'analytics.insight.readyNotScheduled', values: { ready: now.ready, scheduled }, tone: 'info' })
  }
  if (now.total >= 3 && now.draft / now.total > 0.5) out.push({ key: 'analytics.insight.mostlyDrafts', values: { n: now.draft, total: now.total }, tone: 'info' })
  if (data.publishing.upcoming > 0) out.push({ key: 'analytics.insight.upcoming', values: { n: data.publishing.upcoming }, tone: 'good' })

  const change = compare(data.publishing.published, data.publishing.published_previous)
  if (change.kind === 'change' && change.percent > 0) out.push({ key: 'analytics.insight.publishedMore', values: { n: data.publishing.published, previous: data.publishing.published_previous }, tone: 'good' })
  if (change.kind === 'change' && change.percent < 0) out.push({ key: 'analytics.insight.publishedLess', values: { n: data.publishing.published, previous: data.publishing.published_previous }, tone: 'info' })

  // Most active channel / most used format: only with a clear leader.
  const channels = [...data.publishing.by_channel].filter((c) => c.published > 0).sort((a, b) => b.published - a.published)
  if (channels.length && (channels.length === 1 || channels[0].published > channels[1].published)) {
    out.push({
      key: 'analytics.insight.topChannel',
      values: { n: channels[0].published },
      translate: { channel: `publishing.channel.${channels[0].channel}` as MessageKey },
      tone: 'good',
    })
  }
  const types = Object.entries(data.content.by_type).sort((a, b) => b[1] - a[1])
  if (data.content.created >= 3 && types.length && (types.length === 1 || types[0][1] > types[1][1])) {
    out.push({ key: 'analytics.insight.topFormat', values: { n: types[0][1] }, translate: { type: `contentType.${types[0][0]}` as MessageKey }, tone: 'info' })
  }

  return out.slice(0, maxItems)
}
