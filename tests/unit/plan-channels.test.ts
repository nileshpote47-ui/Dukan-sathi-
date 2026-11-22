import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptNewAccounts, allowedChannels, freeSlots, planAllowsChannel, usableAccountIds } from '@/lib/billing/channels'
import { CHANNELS, type Channel } from '@/lib/config/publishing'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'

const free = { allowed_channels: ['FACEBOOK', 'INSTAGRAM'], max_connected_accounts: 1 }
const starter = { allowed_channels: ['FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS_PROFILE'], max_connected_accounts: null }
const growth = { allowed_channels: [...CHANNELS], max_connected_accounts: null }

const incoming = (channel: Channel, externalId: string) => ({ channel, externalId })
const existing = (channel: Channel, id: string, status = 'CONNECTED', connected_at = '2026-11-20T00:00:00Z') => ({
  id: `${channel}-${id}`,
  channel,
  external_account_id: id,
  status,
  connected_at,
})

describe('plan channels', () => {
  it('Free: Facebook or Instagram only; Starter adds Google Business Profile; Growth has everything', () => {
    expect(allowedChannels(free)).toEqual(['INSTAGRAM', 'FACEBOOK'])
    expect(planAllowsChannel(free, 'WHATSAPP')).toBe(false)
    expect(planAllowsChannel(starter, 'GOOGLE_BUSINESS_PROFILE')).toBe(true)
    expect(planAllowsChannel(starter, 'YOUTUBE')).toBe(false)
    expect(planAllowsChannel(starter, 'WHATSAPP')).toBe(false)
    expect(allowedChannels(growth)).toEqual([...CHANNELS])
    // Missing data (older rows) means no restriction rather than a broken page.
    expect(allowedChannels({ allowed_channels: null, max_connected_accounts: null })).toEqual([...CHANNELS])
  })

  it('Free connects ONE account: only the channel the owner picked, and nothing once the slot is used', () => {
    const metaLogin = [incoming('FACEBOOK', 'page_1'), incoming('INSTAGRAM', 'ig_1')]
    expect(acceptNewAccounts(free, metaLogin, [], 'INSTAGRAM')).toEqual([incoming('INSTAGRAM', 'ig_1')])
    expect(acceptNewAccounts(free, metaLogin, [], 'FACEBOOK')).toEqual([incoming('FACEBOOK', 'page_1')])
    // Without a choice only one is taken.
    expect(acceptNewAccounts(free, metaLogin, [])).toHaveLength(1)
    // Slot used by another account → nothing new; reconnecting the same account is always fine.
    expect(acceptNewAccounts(free, metaLogin, [existing('FACEBOOK', 'page_1')], 'INSTAGRAM')).toEqual([])
    expect(acceptNewAccounts(free, metaLogin, [existing('FACEBOOK', 'page_1', 'EXPIRED')], 'FACEBOOK')).toEqual([incoming('FACEBOOK', 'page_1')])
    // A disconnected account frees the slot.
    expect(acceptNewAccounts(free, metaLogin, [existing('FACEBOOK', 'page_1', 'DISCONNECTED')], 'INSTAGRAM')).toEqual([incoming('INSTAGRAM', 'ig_1')])
    expect(acceptNewAccounts(free, [incoming('WHATSAPP', 'wa_1')], [])).toEqual([])
  })

  it('Starter connects several Facebook, Instagram and Google accounts, but no WhatsApp or YouTube', () => {
    const login = [incoming('FACEBOOK', 'p'), incoming('INSTAGRAM', 'i')]
    expect(acceptNewAccounts(starter, login, [existing('GOOGLE_BUSINESS_PROFILE', 'g')])).toEqual(login)
    expect(acceptNewAccounts(starter, [incoming('YOUTUBE', 'y')], [])).toEqual([])
    expect(freeSlots(starter, [existing('FACEBOOK', 'p')])).toBe(Infinity)
    expect(freeSlots(free, [existing('FACEBOOK', 'p')])).toBe(0)
    expect(freeSlots(free, [])).toBe(1)
  })

  it('after moving down to Free only the first connected account in an allowed channel can be used', () => {
    const accounts = [
      existing('INSTAGRAM', 'i', 'CONNECTED', '2026-11-21T00:00:00Z'),
      existing('FACEBOOK', 'p', 'CONNECTED', '2026-11-20T00:00:00Z'),
      existing('WHATSAPP', 'w', 'CONNECTED', '2026-11-19T00:00:00Z'),
    ]
    expect([...usableAccountIds(free, accounts)]).toEqual(['FACEBOOK-p'])
    expect(usableAccountIds(growth, accounts).size).toBe(3)
    expect(usableAccountIds(starter, accounts).has('WHATSAPP-w')).toBe(false)
  })
})

describe('plan channel data and texts', () => {
  it('the migration lists exactly the app channels and seeds every plan', () => {
    const dir = join(__dirname, '../../supabase/migrations')
    const sql = readdirSync(dir).filter((f) => f.endsWith('_plan_channels.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
    expect(sql).toContain(`allowed_channels <@ array[${CHANNELS.map((c) => `'${c}'`).join(', ')}]`)
    for (const slug of ['free', 'starter', 'growth', 'premium']) expect(sql).toContain(`('${slug}', array[`)
  })

  it('messages exist in English, Marathi and Hindi', () => {
    const keys = Object.keys(en).filter((k) => !k.startsWith('admin.') && /planChannel|planAccounts|plan_channel|plan_accounts|choose_one|planOnly|planLimit|chooseOne|notInPlan|billing\.channels|connectedAccounts/.test(k))
    expect(keys.length).toBeGreaterThanOrEqual(10)
    for (const dict of [mr, hi] as Record<string, string>[]) for (const key of keys) expect(dict[key], key).toBeTruthy()
  })
})
