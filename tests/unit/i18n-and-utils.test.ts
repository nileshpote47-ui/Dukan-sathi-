import { describe, expect, it } from 'vitest'
import { getMessages, getTranslator } from '@/lib/i18n'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'
import { formatLocation, profileCompletion } from '@/lib/utils/business'
import { greetingKey } from '@/lib/utils/greeting'
import type { Tables } from '@/types/database'

describe('i18n', () => {
  it('translates, interpolates and falls back to English', () => {
    const t = getTranslator('mr')
    expect(t('nav.dashboard')).toBe('डॅशबोर्ड')
    expect(t('greeting.morning', { name: 'Ganesh Kirana' })).toBe('सुप्रभात, Ganesh Kirana')
    expect(t('auth.loginTitle')).toBe(en['auth.loginTitle'])
  })

  it('unknown languages use English', () => {
    expect(getMessages('xx')).toEqual(getMessages('en'))
    expect(getMessages(null)['nav.business']).toBe('My Business')
  })

  it('translations keep the same placeholders as English', () => {
    for (const dict of [mr, hi]) {
      for (const [key, value] of Object.entries(dict)) {
        const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        expect(placeholders(value as string), key).toEqual(placeholders(en[key as keyof typeof en]))
      }
    }
  })
})

describe('greeting', () => {
  // 03:00 UTC = 08:30 IST, 08:00 UTC = 13:30 IST, 14:00 UTC = 19:30 IST
  it('uses India time, not server time', () => {
    expect(greetingKey(new Date('2026-11-18T03:00:00Z'))).toBe('greeting.morning')
    expect(greetingKey(new Date('2026-11-18T08:00:00Z'))).toBe('greeting.afternoon')
    expect(greetingKey(new Date('2026-11-18T14:00:00Z'))).toBe('greeting.evening')
    expect(greetingKey(new Date('2026-11-18T20:00:00Z'))).toBe('greeting.evening') // 01:30 IST
  })
})

describe('business helpers', () => {
  const business = {
    business_name: 'Shree Ganesh Kirana',
    business_category: 'grocery',
    phone: '9876543210',
    whatsapp_number: null,
    address_line: null,
    village: 'Shirur',
    taluka: null,
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '412210',
    description: null,
    brand_tagline: null,
    opening_hours: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    google_business_url: null,
  } as Tables<'businesses'>

  it('computes profile completion from filled fields', () => {
    expect(profileCompletion(business)).toBe(45) // 5 of 11
    expect(profileCompletion({ ...business, instagram_url: 'https://instagram.com/x' })).toBe(55)
  })

  it('formats a location without empty parts', () => {
    expect(formatLocation(business)).toBe('Shirur, Pune, Maharashtra 412210')
  })
})
