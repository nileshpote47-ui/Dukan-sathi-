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
import { en } from '@/lib/i18n/messages/en'

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
    expect(tableCheck('plan_entitlements', 'feature_key')).toEqual([...FEATURE_KEYS])
    expect(tableCheck('usage_ledger', 'feature_key')).toEqual([...FEATURE_KEYS])
    expect(tableCheck('business_subscriptions', 'status')).toEqual([...SUBSCRIPTION_STATUSES])
    expect(tableCheck('business_subscriptions', 'provider')).toEqual([...BILLING_PROVIDERS])
    expect(tableCheck('billing_payments', 'status')).toEqual([...PAYMENT_STATUSES])
    expect(tableCheck('usage_ledger', 'transaction_type')).toEqual([...LEDGER_TRANSACTION_TYPES])
    expect(tableCheck('usage_ledger', 'state')).toEqual([...LEDGER_STATES])
    // The database functions list the same features.
    expect(billing).toContain(`p_feature not in (${FEATURE_KEYS.map((f) => `'${f}'`).join(', ')})`)
    // Seeded plans: free + the purchasable plans, each with every feature.
    for (const slug of [FREE_PLAN_SLUG, ...PAID_PLAN_SLUGS]) {
      expect(billing).toMatch(new RegExp(`\\('${slug}', '`))
      for (const feature of FEATURE_KEYS) expect(billing).toContain(`('${slug}', '${feature}', `)
    }
  })

  it('every category has an English label', () => {
    for (const id of BUSINESS_CATEGORIES) expect(en[`category.${id}`]).toBeTruthy()
  })
})
