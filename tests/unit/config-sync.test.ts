import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { CONTENT_STATUSES, CONTENT_TYPES } from '@/lib/config/content'
import { LANGUAGE_CODES } from '@/lib/config/languages'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES } from '@/lib/config/marketing'
import { en } from '@/lib/i18n/messages/en'

const migrationsDir = join(__dirname, '../../supabase/migrations')
const allMigrations = readdirSync(migrationsDir)
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')

/**
 * Values in the latest column definition of the form `<column> text ... check (<column> in (...))`.
 * Only column definitions count, not other constraints that mention the column.
 */
function checkValues(column: string): string[] {
  const pattern = new RegExp(`\\b${column} text\\b[^,]*?check \\(${column} in \\(([^)]*)\\)`, 'g')
  const found = [...allMigrations.matchAll(pattern)].at(-1)
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
    expect(checkValues('status')).toEqual([...CONTENT_STATUSES])
    expect(checkValues('language')).toEqual([...LANGUAGE_CODES])
    expect(checkValues('content_language')).toEqual([...LANGUAGE_CODES])
  })

  it('marketing preference options', () => {
    expect(checkValues('tone')).toEqual([...TONES])
    expect(checkValues('promotional_style')).toEqual([...PROMOTIONAL_STYLES])
    expect(checkValues('preferred_contact_method')).toEqual([...CONTACT_METHODS])
  })

  it('every category has an English label', () => {
    for (const id of BUSINESS_CATEGORIES) expect(en[`category.${id}`]).toBeTruthy()
  })
})
