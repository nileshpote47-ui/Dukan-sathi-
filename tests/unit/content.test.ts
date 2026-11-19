import { describe, expect, it } from 'vitest'
import { CATEGORY_EXAMPLE_GROUP, EXAMPLE_GROUPS, exampleGroupFor } from '@/lib/config/category-examples'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { CONTENT_STATUSES, CONTENT_TYPES, QUICK_ACTION_TYPES, STATUS_TRANSITIONS } from '@/lib/config/content'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES } from '@/lib/config/marketing'
import { canTransition, hasPromotableDetails, isEditable, statusChangeProblem } from '@/lib/content/status'
import { en } from '@/lib/i18n/messages/en'
import { buildAIContentRequest, buildMarketingContext } from '@/lib/marketing/context'
import {
  addMonths,
  istDateKey,
  istInputToIso,
  isoToIstInput,
  monthGrid,
  monthRangeIso,
  parseYearMonth,
} from '@/lib/utils/datetime'
import { contentFormSchema, escapeLike, marketingPreferencesSchema, parseContentListParams } from '@/lib/validation/content'
import { decodeMessage } from '@/lib/validation/fields'
import type { Tables } from '@/types/database'

describe('status lifecycle', () => {
  it('allows exactly the documented transitions', () => {
    const allowed = CONTENT_STATUSES.flatMap((from) => CONTENT_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`))
    expect(allowed.sort()).toEqual(
      ['DRAFT->READY', 'READY->SCHEDULED', 'SCHEDULED->DRAFT', 'DRAFT->ARCHIVED', 'READY->ARCHIVED'].sort(),
    )
  })

  it('never lets users publish', () => {
    for (const from of CONTENT_STATUSES) expect(STATUS_TRANSITIONS[from]).not.toContain('PUBLISHED')
  })

  it('archived and published content is read-only', () => {
    expect(isEditable('DRAFT')).toBe(true)
    expect(isEditable('SCHEDULED')).toBe(true)
    expect(isEditable('ARCHIVED')).toBe(false)
    expect(isEditable('PUBLISHED')).toBe(false)
  })

  it('checks details and dates before scheduling', () => {
    const now = new Date('2026-11-19T06:00:00Z')
    const ready = { status: 'READY' as const, product_name: 'Rice' }
    expect(statusChangeProblem({ status: 'DRAFT' }, 'READY', null, now)).toBe('errors.needsDetails')
    expect(statusChangeProblem({ status: 'DRAFT', offer_text: '10% off' }, 'READY', null, now)).toBeNull()
    expect(statusChangeProblem({ status: 'DRAFT', product_name: 'x' }, 'SCHEDULED', '2026-12-01T00:00:00Z', now)).toBe('errors.invalidTransition')
    expect(statusChangeProblem(ready, 'SCHEDULED', null, now)).toBe('errors.scheduleInvalid')
    expect(statusChangeProblem(ready, 'SCHEDULED', '2026-11-19T05:00:00Z', now)).toBe('errors.scheduleInPast')
    expect(statusChangeProblem(ready, 'SCHEDULED', '2026-11-20T05:00:00Z', now)).toBeNull()
    expect(hasPromotableDetails({ description: '   ' })).toBe(false)
  })
})

describe('India time helpers', () => {
  it('converts datetime-local values in IST to UTC and back', () => {
    expect(istInputToIso('2026-11-20T10:30')).toBe('2026-11-20T05:00:00.000Z')
    expect(isoToIstInput('2026-11-20T05:00:00.000Z')).toBe('2026-11-20T10:30')
    expect(istInputToIso('2026-02-31T10:00')).toBeNull()
    expect(istInputToIso('tomorrow')).toBeNull()
  })

  it('puts late-evening UTC times on the next IST day', () => {
    expect(istDateKey('2026-11-19T20:00:00Z')).toBe('2026-11-20')
  })

  it('builds Monday-first month grids', () => {
    const weeks = monthGrid({ year: 2026, month: 11 }) // 1 Nov 2026 is a Sunday
    expect(weeks[0][0].key).toBe('2026-10-26')
    expect(weeks[0][6]).toEqual({ key: '2026-11-01', day: 1, inMonth: true })
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30)
  })

  it('computes month ranges in IST and month arithmetic', () => {
    expect(monthRangeIso({ year: 2026, month: 11 })).toEqual({
      start: '2026-10-31T18:30:00.000Z',
      end: '2026-11-30T18:30:00.000Z',
    })
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(parseYearMonth('2026-13', new Date('2026-11-19T00:00:00Z'))).toEqual({ year: 2026, month: 11 })
    expect(parseYearMonth('2027-02')).toEqual({ year: 2027, month: 2 })
  })
})

describe('content validation', () => {
  const base = {
    content_type: 'POST',
    title: 'Weekend rice offer',
    product_name: '',
    offer_text: '',
    price: '',
    description: '',
    call_to_action: '',
    notes: '',
    language: 'mr',
    template_id: '',
  }

  it('accepts a minimal draft and normalises empty fields', () => {
    const result = contentFormSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.product_name).toBeNull()
      expect(result.data.template_id).toBeNull()
    }
  })

  it('rejects unknown types, short titles and bad template ids', () => {
    const issues = (input: object) =>
      contentFormSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => decodeMessage(i.message).key)
    expect(issues({ content_type: 'SPAM' })).toContain('validation.contentType')
    expect(issues({ title: 'x' })).toContain('validation.tooShort')
    expect(issues({ template_id: 'not-a-uuid' })).toContain('validation.template')
  })

  it('never includes owner or business ids', () => {
    expect(Object.keys(contentFormSchema.shape)).not.toContain('owner_id')
    expect(Object.keys(contentFormSchema.shape)).not.toContain('business_id')
  })

  it('parses list params leniently', () => {
    expect(parseContentListParams({ q: '  rice ', type: 'OFFER', status: 'PUBLISHED', view: 'grid', page: '3' })).toEqual({
      q: 'rice',
      type: 'OFFER',
      status: 'PUBLISHED', // a filter option since Phase 6 publishing
      view: 'grid',
      page: 3,
    })
    expect(parseContentListParams({ type: 'NOPE', status: 'SENT', page: '-1', view: 'table' })).toEqual({
      q: '',
      type: undefined,
      status: undefined,
      view: 'list',
      page: 1,
    })
  })

  it('escapes LIKE wildcards in search', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\')
  })

  it('marketing preferences accept known options only', () => {
    const prefs = {
      content_language: '',
      tone: 'friendly',
      promotional_style: '',
      preferred_contact_method: 'whatsapp',
      target_customers: '',
      preferred_cta: '',
      description: '',
    }
    const ok = marketingPreferencesSchema.safeParse(prefs)
    expect(ok.success && ok.data).toMatchObject({ tone: 'friendly', promotional_style: null, content_language: null })
    expect(marketingPreferencesSchema.safeParse({ ...prefs, tone: 'angry' }).success).toBe(false)
  })
})

describe('marketing context (AI-ready input)', () => {
  const business = {
    id: 'b1',
    business_name: 'Shree Ganesh Kirana',
    business_category: 'grocery',
    village: 'Shirur',
    taluka: null,
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '412210',
    description: '  ',
    brand_tagline: 'Fresh groceries',
    target_customers: 'Families nearby',
    phone: '9876543210',
    whatsapp_number: null,
    opening_hours: null,
    content_language: null,
    tone: 'friendly',
    preferred_cta: 'Visit our shop',
    promotional_style: 'offers',
    preferred_contact_method: 'whatsapp',
  } as unknown as Tables<'businesses'>

  const item = {
    id: 'c1',
    content_type: 'OFFER',
    title: 'Rice offer',
    language: 'mr',
    product_name: 'Basmati rice',
    offer_text: '10% off',
    price: '₹450',
    description: null,
    notes: '',
    call_to_action: null,
  } as unknown as Tables<'content_items'>

  it('builds context with fallbacks and without blank values', () => {
    const context = buildMarketingContext(business, { preferred_language: 'hi' })
    expect(context.preferences.language).toBe('hi') // no business content language → owner language
    expect(context.preferences.tone).toBe('friendly')
    expect(context.business.location).toBe('Shirur, Pune, Maharashtra 412210')
    expect(context.business.description).toBeUndefined()
    expect(context.business.whatsapp).toBeUndefined()
  })

  it('builds an AI request; content CTA falls back to the business preference', () => {
    const context = buildMarketingContext(business, { preferred_language: 'en' })
    const withTemplate = buildAIContentRequest(context, item, {
      slug: 'special-offer',
      name: 'Special Offer',
      content_type: 'OFFER',
      default_cta: 'Grab this offer now',
    })
    expect(withTemplate.request).toMatchObject({
      type: 'OFFER',
      product: 'Basmati rice',
      callToAction: 'Visit our shop', // business preference (item has none)
      template: { slug: 'special-offer', contentType: 'OFFER', defaultCta: 'Grab this offer now' },
    })
    expect(withTemplate.generation.language).toBe('mr')
    expect(withTemplate.generation.tone).toBe('friendly')
    expect(withTemplate.request.notes).toBeUndefined()
  })
})

describe('labels exist for every configured value', () => {
  const has = (key: string) => expect(en[key as keyof typeof en], key).toBeTruthy()
  it('types, statuses, quick actions and marketing options', () => {
    CONTENT_TYPES.forEach((v) => {
      has(`contentType.${v}`)
      has(`contentType.${v}.help`)
    })
    CONTENT_STATUSES.forEach((v) => has(`contentStatus.${v}`))
    QUICK_ACTION_TYPES.forEach((v) => has(`quickAction.${v}`))
    TONES.forEach((v) => has(`tone.${v}`))
    PROMOTIONAL_STYLES.forEach((v) => has(`promotionalStyle.${v}`))
    CONTACT_METHODS.forEach((v) => has(`contactMethod.${v}`))
  })

  it('every category has example placeholders', () => {
    for (const category of BUSINESS_CATEGORIES) expect(CATEGORY_EXAMPLE_GROUP[category]).toBeTruthy()
    for (const group of EXAMPLE_GROUPS) for (const f of ['title', 'product', 'offer', 'price']) has(`example.${group}.${f}`)
    expect(exampleGroupFor('agriculture_agro_input')).toBe('agri')
    expect(exampleGroupFor('unknown')).toBe('general')
  })
})
