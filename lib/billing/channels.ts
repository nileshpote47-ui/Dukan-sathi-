import { CHANNELS, type Channel } from '@/lib/config/publishing'

/*
 * Which channels a plan may use and how many accounts it may connect (plan data from billing_plans,
 * owner's decision). Pure helpers, used by the server checks (connect + publish) and the pages.
 */

export interface PlanChannelRules {
  allowed_channels: string[] | null | undefined
  max_connected_accounts: number | null | undefined
}

export function allowedChannels(plan: PlanChannelRules): Channel[] {
  const list = plan.allowed_channels ?? [...CHANNELS]
  return CHANNELS.filter((c) => list.includes(c))
}

export const planAllowsChannel = (plan: PlanChannelRules, channel: Channel) => allowedChannels(plan).includes(channel)

/**
 * The accounts a plan may use: on plans with a connected-account limit only the earliest connected ones count
 * (e.g. after moving down to Free). Disconnected accounts never count.
 */
export function usableAccountIds<T extends { id: string; channel: string; status: string; connected_at: string }>(plan: PlanChannelRules, accounts: T[]): Set<string> {
  const active = accounts
    .filter((a) => a.status !== 'DISCONNECTED' && planAllowsChannel(plan, a.channel as Channel))
    .sort((a, b) => a.connected_at.localeCompare(b.connected_at))
  const limit = plan.max_connected_accounts ?? Infinity
  return new Set(active.slice(0, limit).map((a) => a.id))
}

/**
 * Accounts from a new connection that may be saved: only allowed channels (and only the channel the owner picked,
 * when the plan allows one account), reconnecting an existing account never needs a new slot, and new accounts
 * only while slots are free.
 */
export function acceptNewAccounts<T extends { channel: Channel; externalId: string }>(
  plan: PlanChannelRules,
  incoming: T[],
  existing: { channel: string; external_account_id: string; status: string }[],
  only?: Channel | null,
): T[] {
  const active = existing.filter((a) => a.status !== 'DISCONNECTED')
  const known = new Set(active.map((a) => `${a.channel}:${a.external_account_id}`))
  let free = (plan.max_connected_accounts ?? Infinity) - active.length
  const out: T[] = []
  for (const account of incoming) {
    if (!planAllowsChannel(plan, account.channel)) continue
    if (only && account.channel !== only) continue
    if (known.has(`${account.channel}:${account.externalId}`)) {
      out.push(account)
    } else if (free > 0) {
      out.push(account)
      free--
    }
  }
  return out
}

/** Free slots for new accounts (Infinity when the plan has no limit). */
export function freeSlots(plan: PlanChannelRules, existing: { status: string }[]): number {
  if (plan.max_connected_accounts == null) return Infinity
  return Math.max(0, plan.max_connected_accounts - existing.filter((a) => a.status !== 'DISCONNECTED').length)
}
