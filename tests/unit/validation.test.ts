import { describe, expect, it } from 'vitest'
import { loginSchema, safeNextPath, signupSchema } from '@/lib/validation/auth'
import {
  basicsSchema,
  brandStepSchema,
  businessFormSchema,
  contactStepSchema,
  locationStepSchema,
} from '@/lib/validation/business'
import { decodeMessage } from '@/lib/validation/fields'

const errorKeyFor = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  decodeMessage(result.error?.issues.find((i) => i.path[0] === field)?.message).key

describe('auth schemas', () => {
  it('normalises email and requires a password', () => {
    const ok = loginSchema.safeParse({ email: '  Ravi@Example.COM ', password: 'x' })
    expect(ok.success && ok.data.email).toBe('ravi@example.com')
    expect(errorKeyFor(loginSchema.safeParse({ email: 'nope', password: '' }), 'email')).toBe('validation.email')
    expect(errorKeyFor(loginSchema.safeParse({ email: 'a@b.co', password: '' }), 'password')).toBe('validation.required')
  })

  it('enforces password length on signup with the limit in the message', () => {
    const result = signupSchema.safeParse({ fullName: 'Ravi', email: 'a@b.co', password: 'short' })
    const message = decodeMessage(result.error?.issues[0].message)
    expect(message).toEqual({ key: 'validation.tooShort', values: { min: 8 } })
  })

  it('only allows in-app redirect targets', () => {
    expect(safeNextPath('/dashboard/business')).toBe('/dashboard/business')
    expect(safeNextPath('//evil.example')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard')
    expect(safeNextPath('https://evil.example')).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
  })
})

describe('business schemas', () => {
  it('accepts known categories only', () => {
    expect(basicsSchema.safeParse({ business_name: 'Shree Ganesh Kirana', business_category: 'grocery' }).success).toBe(true)
    expect(errorKeyFor(basicsSchema.safeParse({ business_name: 'X Shop', business_category: 'casino' }), 'business_category')).toBe(
      'validation.category',
    )
  })

  it('normalises Indian phone numbers and turns empty optional fields into null', () => {
    const result = contactStepSchema.safeParse({ ownerName: 'Ravi', phone: '98765 43210', whatsapp_number: '', email: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('9876543210')
      expect(result.data.whatsapp_number).toBeNull()
      expect(result.data.email).toBeNull()
    }
    expect(contactStepSchema.safeParse({ ownerName: 'Ravi', phone: '+91-98765-43210', whatsapp_number: '', email: '' }).success).toBe(true)
    expect(errorKeyFor(contactStepSchema.safeParse({ ownerName: 'Ravi', phone: '12345', whatsapp_number: '', email: '' }), 'phone')).toBe(
      'validation.phone',
    )
  })

  it('validates pincode and email formats', () => {
    const base = { address_line: '', village: 'Shirur', taluka: '', district: 'Pune', state: 'Maharashtra' }
    expect(locationStepSchema.safeParse({ ...base, pincode: '412210' }).success).toBe(true)
    expect(errorKeyFor(locationStepSchema.safeParse({ ...base, pincode: '012345' }), 'pincode')).toBe('validation.pincode')
    expect(errorKeyFor(contactStepSchema.safeParse({ ownerName: 'Ravi', phone: '9876543210', whatsapp_number: '', email: 'x@' }), 'email')).toBe(
      'validation.email',
    )
  })

  it('accepts only http(s) URLs', () => {
    const empty = { brand_tagline: '', description: '', opening_hours: '', website_url: '', facebook_url: '', google_business_url: '' }
    expect(brandStepSchema.safeParse({ ...empty, instagram_url: 'https://instagram.com/shop' }).success).toBe(true)
    expect(errorKeyFor(brandStepSchema.safeParse({ ...empty, instagram_url: 'javascript:alert(1)' }), 'instagram_url')).toBe('validation.url')
    expect(errorKeyFor(brandStepSchema.safeParse({ ...empty, instagram_url: 'instagram.com/shop' }), 'instagram_url')).toBe('validation.url')
  })

  it('enforces length limits', () => {
    const result = brandStepSchema.safeParse({
      brand_tagline: 'x'.repeat(121),
      description: '',
      opening_hours: '',
      website_url: '',
      instagram_url: '',
      facebook_url: '',
      google_business_url: '',
    })
    expect(decodeMessage(result.error?.issues[0].message)).toEqual({ key: 'validation.tooLong', values: { max: 120 } })
  })

  it('full form never contains owner_id', () => {
    expect(Object.keys(businessFormSchema.shape)).not.toContain('owner_id')
  })
})
