import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { LANGUAGE_CODES } from '@/lib/config/languages'
import { en } from '@/lib/i18n/messages/en'

const migrationsDir = join(__dirname, '../../supabase/migrations')
const allMigrations = readdirSync(migrationsDir)
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')

/** Values listed in the latest `check (<column> in (...))` constraint. */
function checkValues(column: string): string[] {
  const pattern = new RegExp(`check \\(${column} in \\(([^)]*)\\)`, 'g')
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

  it('every category has an English label', () => {
    for (const id of BUSINESS_CATEGORIES) expect(en[`category.${id}`]).toBeTruthy()
  })
})
