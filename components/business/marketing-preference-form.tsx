'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { saveMarketingPreferences } from '@/app/dashboard/business/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { LANGUAGES } from '@/lib/config/languages'
import { CONTACT_METHODS, PROMOTIONAL_STYLES, TONES } from '@/lib/config/marketing'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { marketingPreferencesSchema, type MarketingPreferencesInput } from '@/lib/validation/content'

type Field = keyof MarketingPreferencesInput

/** Business marketing preferences — later used by the AI content engine (Phase 3). */
export function MarketingPreferenceForm({ initialValues }: { initialValues: MarketingPreferencesInput }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<MessageKey | null>(null)
  const form = useForm({ resolver: zodResolver(marketingPreferencesSchema), defaultValues: initialValues, mode: 'onTouched' })
  const bind = (name: Field) => ({ registration: form.register(name), error: form.formState.errors[name]?.message })

  const onSubmit = form.handleSubmit(
    () => {
      setFormError(null)
      startTransition(async () => {
        const result = await saveMarketingPreferences(form.getValues())
        if (result.ok) {
          toast.success(t('marketing.saved'))
          router.push('/dashboard/business')
          router.refresh()
          return
        }
        for (const [name, message] of Object.entries(result.fieldErrors ?? {})) form.setError(name as Field, { message })
        setFormError(result.fieldErrors ? 'errors.validation' : result.error)
      })
    },
    () => setFormError('errors.validation'),
  )

  const select = (name: Field, label: MessageKey, options: readonly string[], prefix: string, emptyLabel: string) => {
    const f = bind(name)
    return (
      <FormField label={t(label)} error={f.error} optional>
        <Select {...f.registration}>
          <option value="">{emptyLabel}</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {t(`${prefix}.${value}` as MessageKey)}
            </option>
          ))}
        </Select>
      </FormField>
    )
  }

  const language = bind('content_language')
  const target = bind('target_customers')
  const cta = bind('preferred_cta')
  const description = bind('description')

  return (
    <Card className="mx-auto max-w-2xl">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label={t('marketing.contentLanguage')} error={language.error} optional>
          <Select {...language.registration}>
            <option value="">{t('marketing.contentLanguageDefault')}</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel}
              </option>
            ))}
          </Select>
        </FormField>
        {select('tone', 'marketing.tone', TONES, 'tone', t('marketing.notSet'))}
        <FormField label={t('marketing.targetCustomers')} error={target.error} optional>
          <Textarea {...target.registration} placeholder={t('marketing.targetCustomersPlaceholder')} rows={2} maxLength={300} />
        </FormField>
        <FormField label={t('marketing.preferredCta')} error={cta.error} optional>
          <Input {...cta.registration} placeholder={t('contentField.ctaPlaceholder')} maxLength={120} />
        </FormField>
        {select('promotional_style', 'marketing.promotionalStyle', PROMOTIONAL_STYLES, 'promotionalStyle', t('marketing.notSet'))}
        {select('preferred_contact_method', 'marketing.contactMethod', CONTACT_METHODS, 'contactMethod', t('marketing.notSet'))}
        <FormField label={t('marketing.description')} error={description.error} optional>
          <Textarea {...description.registration} placeholder={t('field.descriptionPlaceholder')} rows={3} maxLength={1000} />
        </FormField>

        <FormError message={formError ? t(formError) : null} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Link href="/dashboard/business" className={buttonVariants({ variant: 'secondary' })}>
            {t('common.cancel')}
          </Link>
          <Button type="submit" loading={pending}>
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
