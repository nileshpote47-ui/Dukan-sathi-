import { z } from 'zod'
import {
  category,
  language,
  optionalEmail,
  optionalPhone,
  optionalPincode,
  optionalText,
  optionalUrl,
  requiredPhone,
  requiredText,
} from './fields'

/*
 * Onboarding is split into steps; each step has its own schema.
 * The full business form (My Business page) combines them.
 * Field names match database columns, except ownerName -> profiles.full_name
 * and preferredLanguage -> profiles.preferred_language.
 */

export const nameStepSchema = z.object({
  business_name: requiredText(2, 100),
})

export const categoryStepSchema = z.object({
  business_category: category,
})

export const contactStepSchema = z.object({
  ownerName: requiredText(2, 100),
  phone: requiredPhone,
  whatsapp_number: optionalPhone,
  email: optionalEmail,
})

export const locationStepSchema = z.object({
  address_line: optionalText(200),
  village: requiredText(2, 100),
  taluka: optionalText(100),
  district: requiredText(2, 100),
  state: requiredText(2, 100),
  pincode: optionalPincode,
})

export const languageStepSchema = z.object({
  preferredLanguage: language,
})

export const brandStepSchema = z.object({
  brand_tagline: optionalText(120),
  description: optionalText(1000),
  opening_hours: optionalText(200),
  website_url: optionalUrl,
  instagram_url: optionalUrl,
  facebook_url: optionalUrl,
  google_business_url: optionalUrl,
})

/** Name and category are saved together: the database needs both to create a business. */
export const basicsSchema = nameStepSchema.extend(categoryStepSchema.shape)

export const businessFormSchema = basicsSchema
  .extend(contactStepSchema.shape)
  .extend(locationStepSchema.shape)
  .extend(languageStepSchema.shape)
  .extend(brandStepSchema.shape)

export type BusinessFormInput = z.input<typeof businessFormSchema>
export type BusinessFormOutput = z.output<typeof businessFormSchema>

export const ONBOARDING_STEPS = ['name', 'category', 'contact', 'location', 'language', 'brand', 'review'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Columns of public.businesses that the owner may edit. Never includes owner_id. */
export const EDITABLE_BUSINESS_COLUMNS = [
  'business_name',
  'business_category',
  'phone',
  'whatsapp_number',
  'email',
  'address_line',
  'village',
  'taluka',
  'district',
  'state',
  'pincode',
  'brand_tagline',
  'description',
  'opening_hours',
  'website_url',
  'instagram_url',
  'facebook_url',
  'google_business_url',
] as const
