/**
 * Business categories — the single source of truth for the app.
 * The database check constraint on businesses.business_category must list the same ids
 * (tests/unit/config-sync.test.ts fails if they drift).
 *
 * To add a category: add it here, add its label to every file in lib/i18n/messages,
 * and add a migration that updates the check constraint.
 */
export const BUSINESS_CATEGORIES = [
  'grocery',
  'mobile_shop',
  'clothing',
  'electronics',
  'hardware',
  'footwear',
  'jewellery',
  'medical_pharmacy',
  'restaurant_food',
  'bakery',
  'salon',
  'automobile',
  'repair_services',
  'coaching_education',
  'agriculture_agro_input',
  'nursery',
  'dairy',
  'farm_equipment',
  'furniture',
  'stationery',
  'other',
] as const

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number]

export const isBusinessCategory = (value: string): value is BusinessCategory =>
  (BUSINESS_CATEGORIES as readonly string[]).includes(value)
