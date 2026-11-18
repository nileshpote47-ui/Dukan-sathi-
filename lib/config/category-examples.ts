import type { BusinessCategory } from './categories'

/**
 * Category-specific example text for form placeholders (UI hints only, never saved).
 * Categories are grouped so each group shares one set of examples in lib/i18n/messages
 * (keys: example.<group>.title / .product / .offer / .price).
 */
export const EXAMPLE_GROUPS = ['grocery', 'mobile', 'fashion', 'agri', 'food', 'services', 'general'] as const
export type ExampleGroup = (typeof EXAMPLE_GROUPS)[number]

export const CATEGORY_EXAMPLE_GROUP: Record<BusinessCategory, ExampleGroup> = {
  grocery: 'grocery',
  dairy: 'grocery',
  stationery: 'general',
  mobile_shop: 'mobile',
  electronics: 'mobile',
  clothing: 'fashion',
  footwear: 'fashion',
  jewellery: 'fashion',
  agriculture_agro_input: 'agri',
  nursery: 'agri',
  farm_equipment: 'agri',
  restaurant_food: 'food',
  bakery: 'food',
  salon: 'services',
  repair_services: 'services',
  coaching_education: 'services',
  medical_pharmacy: 'services',
  automobile: 'services',
  hardware: 'general',
  furniture: 'general',
  other: 'general',
}

export function exampleGroupFor(category: string | null | undefined): ExampleGroup {
  return (category && CATEGORY_EXAMPLE_GROUP[category as BusinessCategory]) || 'general'
}
