'use client'

import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormField } from '@/components/ui/form-field'
import { Input, Radio, Select, Textarea } from '@/components/ui/input'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { LANGUAGES } from '@/lib/config/languages'
import { useI18n } from '@/lib/i18n/provider'
import type { BusinessFormInput } from '@/lib/validation/business'

/**
 * Field groups used by both onboarding (one group per step) and the
 * My Business edit form (all groups). Each form passes `field(name)`,
 * which returns the react-hook-form registration and the current error.
 */
export type FieldName = keyof BusinessFormInput
export type FieldBinder = (name: FieldName) => { registration: UseFormRegisterReturn; error?: string }

export function NameField({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const f = field('business_name')
  return (
    <FormField label={t('field.businessName')} error={f.error}>
      <Input {...f.registration} placeholder={t('field.businessNamePlaceholder')} autoComplete="organization" maxLength={100} />
    </FormField>
  )
}

export function CategoryField({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const f = field('business_category')
  return (
    <FormField label={t('field.category')} error={f.error}>
      <Select {...f.registration}>
        <option value="">{t('field.categoryPlaceholder')}</option>
        {BUSINESS_CATEGORIES.map((id) => (
          <option key={id} value={id}>
            {t(`category.${id}`)}
          </option>
        ))}
      </Select>
    </FormField>
  )
}

export function ContactFields({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const owner = field('ownerName')
  const phone = field('phone')
  const whatsapp = field('whatsapp_number')
  const email = field('email')
  return (
    <>
      <FormField label={t('field.ownerName')} error={owner.error}>
        <Input {...owner.registration} autoComplete="name" maxLength={100} />
      </FormField>
      <FormField label={t('field.phone')} error={phone.error}>
        <Input {...phone.registration} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
      </FormField>
      <FormField label={t('field.whatsapp')} error={whatsapp.error} optional>
        <Input {...whatsapp.registration} type="tel" inputMode="tel" placeholder="98765 43210" />
      </FormField>
      <FormField label={t('field.email')} error={email.error} optional>
        <Input {...email.registration} type="email" inputMode="email" autoComplete="email" />
      </FormField>
    </>
  )
}

export function LocationFields({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const text = (name: FieldName, label: string, opts: { optional?: boolean; placeholder?: string; autoComplete?: string } = {}) => {
    const f = field(name)
    return (
      <FormField label={label} error={f.error} optional={opts.optional}>
        <Input {...f.registration} placeholder={opts.placeholder} autoComplete={opts.autoComplete} maxLength={200} />
      </FormField>
    )
  }
  const pincode = field('pincode')
  return (
    <>
      {text('address_line', t('field.addressLine'), { optional: true, placeholder: t('field.addressPlaceholder'), autoComplete: 'street-address' })}
      {text('village', t('field.village'), { autoComplete: 'address-level3' })}
      {text('taluka', t('field.taluka'), { optional: true })}
      {text('district', t('field.district'), { autoComplete: 'address-level2' })}
      {text('state', t('field.state'), { autoComplete: 'address-level1' })}
      <FormField label={t('field.pincode')} error={pincode.error} optional>
        <Input {...pincode.registration} inputMode="numeric" autoComplete="postal-code" maxLength={6} />
      </FormField>
    </>
  )
}

export function LanguageField({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const f = field('preferredLanguage')
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{t('field.language')}</legend>
      <p className="mb-3 text-sm text-muted-foreground">{t('field.languageHint')}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {LANGUAGES.map((lang) => (
          <label
            key={lang.code}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
          >
            <Radio {...f.registration} value={lang.code} />
            <span>
              <span className="block font-medium">{lang.nativeLabel}</span>
              {lang.nativeLabel !== lang.label && <span className="text-sm text-muted-foreground">{lang.label}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function BrandFields({ field }: { field: FieldBinder }) {
  const { t } = useI18n()
  const tagline = field('brand_tagline')
  const description = field('description')
  const hours = field('opening_hours')
  const url = (name: FieldName, label: string) => {
    const f = field(name)
    return (
      <FormField label={label} error={f.error} optional>
        <Input {...f.registration} type="url" inputMode="url" placeholder="https://" maxLength={500} />
      </FormField>
    )
  }
  return (
    <>
      <FormField label={t('field.tagline')} error={tagline.error} optional>
        <Input {...tagline.registration} placeholder={t('field.taglinePlaceholder')} maxLength={120} />
      </FormField>
      <FormField label={t('field.description')} error={description.error} optional>
        <Textarea {...description.registration} placeholder={t('field.descriptionPlaceholder')} maxLength={1000} rows={3} />
      </FormField>
      <FormField label={t('field.openingHours')} error={hours.error} optional>
        <Input {...hours.registration} placeholder={t('field.openingHoursPlaceholder')} maxLength={200} />
      </FormField>
      {url('instagram_url', t('field.instagram'))}
      {url('facebook_url', t('field.facebook'))}
      {url('google_business_url', t('field.googleBusiness'))}
      {url('website_url', t('field.website'))}
    </>
  )
}
