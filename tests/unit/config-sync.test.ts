import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { CONTENT_STATUSES, CONTENT_TYPES } from '@/lib/config/content'
import { LANGUAGE_CODES } from '@/lib/config/languages'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES } from '@/lib/config/marketing'
import { MEDIA_ASSET_TYPES, MEDIA_MIME_TYPES, MEDIA_SOURCE_TYPES, MEDIA_STATUSES, MEDIA_BUCKET, MEDIA_MAX_BYTES } from '@/lib/config/media'
import { POSTER_LAYOUTS } from '@/lib/config/poster-templates'
import {
  BILLING_PROVIDERS,
  FEATURE_KEYS,
  FREE_PLAN_SLUG,
  LEDGER_STATES,
  LEDGER_TRANSACTION_TYPES,
  PAID_PLAN_SLUGS,
  PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
} from '@/lib/config/billing'
import {
  ACCOUNT_STATUSES,
  CHANNELS,
  JOB_STATUSES,
  OPT_IN_SOURCES,
  PUBLISH_MODES,
  PUBLISHING_ERROR_CODES,
  SOCIAL_PROVIDERS,
  WHATSAPP_MESSAGE_STATUSES,
} from '@/lib/config/publishing'
import { en } from '@/lib/i18n/messages/en'
import { METRIC_STATUSES } from '@/services/publishing/types'

const migrationsDir = join(__dirname, '../../supabase/migrations')
const migrationFiles = readdirSync(migrationsDir).sort()
const read = (files: string[]) => files.map((f) => readFileSync(join(migrationsDir, f), 'utf8')).join('\n')
const allMigrations = read(migrationFiles)

/**
 * Values in the latest column definition of the form `<column> text ... check (<column> in (...))`.
 * Only column definitions count, not other constraints that mention the column.
 */
function checkValues(column: string, migration?: string): string[] {
  const source = migration ? read(migrationFiles.filter((f) => f.includes(migration))) : allMigrations
  const pattern = new RegExp(`\\b${column} text\\b[^,]*?check \\(${column} in \\(([^)]*)\\)`, 'g')
  const found = [...source.matchAll(pattern)].at(-1)
  if (!found) throw new Error(`No check constraint for ${column}`)
  return [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('config matches the database', () => {
  it('business categories', () => {
    expect(checkValues('business_category')).toEqual([...BUSINESS_CATEGORIES])
  })

  it('languages', () => {
    expect(checkValues('preferred_language')).toEqual([...LANGUAGE_CODES])
  })

  it('content types, statuses and content language', () => {
    expect(checkValues('content_type')).toEqual([...CONTENT_TYPES])
    expect(checkValues('status', 'content_workflow')).toEqual([...CONTENT_STATUSES])
    expect(checkValues('language')).toEqual([...LANGUAGE_CODES])
    expect(checkValues('content_language')).toEqual([...LANGUAGE_CODES])
  })

  it('marketing preference options', () => {
    expect(checkValues('tone')).toEqual([...TONES])
    expect(checkValues('promotional_style')).toEqual([...PROMOTIONAL_STYLES])
    expect(checkValues('preferred_contact_method')).toEqual([...CONTACT_METHODS])
  })

  it('media asset types, sources, statuses and file types', () => {
    expect(checkValues('asset_type', 'media_engine')).toEqual([...MEDIA_ASSET_TYPES])
    expect(checkValues('source_type', 'media_engine')).toEqual([...MEDIA_SOURCE_TYPES])
    expect(checkValues('status', 'media_engine')).toEqual([...MEDIA_STATUSES])
    expect(checkValues('mime_type', 'media_engine')).toEqual([...MEDIA_MIME_TYPES])
  })

  it('storage bucket matches the media config', () => {
    const media = read(migrationFiles.filter((f) => f.includes('media_engine')))
    expect(media).toContain(`values ('${MEDIA_BUCKET}', '${MEDIA_BUCKET}', false, ${MEDIA_MAX_BYTES}, array[${MEDIA_MIME_TYPES.map((m) => `'${m}'`).join(', ')}])`)
    expect(media).toContain(`file_size between 1 and ${MEDIA_MAX_BYTES}`)
  })

  it('every seeded content template has a poster layout (Phase 2 templates are reused)', () => {
    const slugs = [...allMigrations.matchAll(/^\s+\('([a-z-]+)', '[^']+', '(?:POST|OFFER|POSTER|REEL|WHATSAPP|FESTIVAL|OTHER)'/gm)].map((m) => m[1])
    expect(slugs.length).toBeGreaterThanOrEqual(7)
    for (const slug of slugs) expect(POSTER_LAYOUTS[slug], slug).toBeDefined()
  })

  it('billing lists (per table)', () => {
    const billing = read(migrationFiles.filter((f) => f.endsWith('_billing.sql')))
    const tableCheck = (table: string, column: string) => {
      const start = billing.indexOf(`create table public.${table} (`)
      const block = billing.slice(start, billing.indexOf('\n);', start))
      const found = new RegExp(`\\b${column} text\\b[^,]*?check \\(${column} in \\(([^)]*)\\)`).exec(block)
      if (start < 0 || !found) throw new Error(`No check for ${table}.${column}`)
      return [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    }
    // Feature keys: the billing migration's original list, extended by later migrations (latest wins).
    const featureChecks = [...allMigrations.matchAll(/feature_key_check\s+check \(feature_key in \(([^)]*)\)\)/g)]
    const latestFeatures = (table: string) => {
      const found = [...allMigrations.matchAll(new RegExp(`${table}_feature_key_check\\s+check \\(feature_key in \\(([^)]*)\\)\\)`, 'g'))].at(-1)
      return [...(found ?? featureChecks.at(-1))![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    }
    expect(latestFeatures('plan_entitlements')).toEqual([...FEATURE_KEYS])
    expect(latestFeatures('usage_ledger')).toEqual([...FEATURE_KEYS])
    expect(tableCheck('plan_entitlements', 'feature_key')).toEqual(FEATURE_KEYS.filter((f) => f !== 'social_publishing' && f !== 'direct_poster'))
    expect(tableCheck('business_subscriptions', 'status')).toEqual([...SUBSCRIPTION_STATUSES])
    expect(tableCheck('business_subscriptions', 'provider')).toEqual([...BILLING_PROVIDERS])
    expect(tableCheck('billing_payments', 'status')).toEqual([...PAYMENT_STATUSES])
    expect(tableCheck('usage_ledger', 'transaction_type')).toEqual([...LEDGER_TRANSACTION_TYPES])
    expect(tableCheck('usage_ledger', 'state')).toEqual([...LEDGER_STATES])
    // The latest usage function lists the same features.
    const featureLists = [...allMigrations.matchAll(/p_feature not in \(([^)]*)\)/g)]
    expect([...featureLists.at(-1)![1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...FEATURE_KEYS])
    // Seeded plans: free + the purchasable plans, each with every feature.
    for (const slug of [FREE_PLAN_SLUG, ...PAID_PLAN_SLUGS]) {
      expect(allMigrations).toMatch(new RegExp(`\\('${slug}', '`))
      for (const feature of FEATURE_KEYS) expect(allMigrations).toContain(`('${slug}', '${feature}', `)
    }
  })

  it('publishing lists (per table)', () => {
    const publishing = read(migrationFiles.filter((f) => f.endsWith('_publishing.sql')))
    const tableCheck = (table: string, column: string) => {
      const start = publishing.indexOf(`create table public.${table} (`)
      const block = publishing.slice(start, publishing.indexOf('\n);', start))
      const found = new RegExp(`\\b${column} text\\b[^,]*?check \\(${column} in \\(([^)]*)\\)`).exec(block)
      if (start < 0 || !found) throw new Error(`No check for ${table}.${column}`)
      return [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    }
    expect(tableCheck('social_accounts', 'channel')).toEqual([...CHANNELS])
    expect(tableCheck('publishing_jobs', 'channel')).toEqual([...CHANNELS])
    expect(tableCheck('social_accounts', 'provider')).toEqual([...SOCIAL_PROVIDERS])
    expect(tableCheck('social_accounts', 'status')).toEqual([...ACCOUNT_STATUSES])
    expect(tableCheck('publishing_jobs', 'status')).toEqual([...JOB_STATUSES])
    expect(tableCheck('publishing_jobs', 'publish_mode')).toEqual([...PUBLISH_MODES])
    expect(tableCheck('publishing_jobs', 'error_code')).toEqual([...PUBLISHING_ERROR_CODES])
    expect(tableCheck('whatsapp_messages', 'status')).toEqual([...WHATSAPP_MESSAGE_STATUSES])
    expect(tableCheck('whatsapp_contacts', 'opt_in_source')).toEqual([...OPT_IN_SOURCES])
    // The database's retry rule mirrors isRetryableError().
    expect(publishing).toContain("p_error_code not in ('INVALID_MEDIA', 'INVALID_CONTENT', 'SCHEDULING_ERROR')")
  })

  it('engagement snapshot statuses (analytics)', () => {
    const migration = read(migrationFiles.filter((f) => f.endsWith('_analytics_owner.sql')))
    const block = migration.slice(migration.indexOf('create table public.publishing_metrics ('))
    const found = /\bstatus text\b[^,]*?check \(status in \(([^)]*)\)/.exec(block)
    expect([...found![1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...METRIC_STATUSES])
  })

  it('every category has an English label', () => {
    for (const id of BUSINESS_CATEGORIES) expect(en[`category.${id}`]).toBeTruthy()
  })
})
