'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useForm, type FieldValues, type Path } from 'react-hook-form'
import type { z } from 'zod'
import {
  BrandFields,
  CategoryField,
  ContactFields,
  LanguageField,
  LocationFields,
  NameField,
  type FieldBinder,
} from '@/components/business/business-fields'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FormError } from '@/components/ui/states'
import { LANGUAGES } from '@/lib/config/languages'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import {
  brandStepSchema,
  categoryStepSchema,
  contactStepSchema,
  languageStepSchema,
  locationStepSchema,
  nameStepSchema,
  ONBOARDING_STEPS,
  type BusinessFormInput,
  type OnboardingStep,
} from '@/lib/validation/business'
import type { ActionResult } from '@/lib/validation/result'
import { finishOnboarding, saveBasics, saveBrand, saveContact, saveLanguage, saveLocation } from './actions'

type Values = BusinessFormInput
type AnyObjectSchema = z.ZodObject<z.ZodRawShape>

interface StepConfig {
  schema: AnyObjectSchema
  Fields: (props: { field: FieldBinder }) => React.ReactNode
  /** Saves the step on the server. null = kept in the browser until the next step. */
  save: ((values: Values) => Promise<ActionResult>) | null
  optional?: boolean
}

const STEPS: Record<Exclude<OnboardingStep, 'review'>, StepConfig> = {
  name: { schema: nameStepSchema, Fields: NameField, save: null },
  category: {
    schema: categoryStepSchema,
    Fields: CategoryField,
    save: (v) => saveBasics({ business_name: v.business_name, business_category: v.business_category }),
  },
  contact: { schema: contactStepSchema, Fields: ContactFields, save: (v) => saveContact(pick(v, contactStepSchema)) },
  location: { schema: locationStepSchema, Fields: LocationFields, save: (v) => saveLocation(pick(v, locationStepSchema)) },
  language: { schema: languageStepSchema, Fields: LanguageField, save: (v) => saveLanguage(pick(v, languageStepSchema)) },
  brand: { schema: brandStepSchema, Fields: BrandFields, save: (v) => saveBrand(pick(v, brandStepSchema)), optional: true },
}

function pick(values: Values, schema: AnyObjectSchema) {
  return Object.fromEntries(Object.keys(schema.shape).map((k) => [k, values[k as keyof Values]]))
}

export function OnboardingWizard({
  initialValues,
  initialStep,
  resumed,
}: {
  initialValues: Values
  initialStep: number
  resumed: boolean
}) {
  const { t } = useI18n()
  const [stepIndex, setStepIndex] = useState(initialStep)
  const [values, setValues] = useState(initialValues)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const step = ONBOARDING_STEPS[stepIndex]
  const total = ONBOARDING_STEPS.length

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [stepIndex])

  const goTo = (index: number) => setStepIndex(Math.max(0, Math.min(total - 1, index)))

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">
          {t('onboarding.stepOf', { current: stepIndex + 1, total })}
        </p>
        <Progress
          value={((stepIndex + 1) / total) * 100}
          label={t('onboarding.stepOf', { current: stepIndex + 1, total })}
          className="mt-2"
        />
      </div>

      {resumed && stepIndex === initialStep && stepIndex > 0 && (
        <p role="status" className="mb-4 rounded-xl bg-primary-soft p-3 text-sm">
          {t('onboarding.resumed')}
        </p>
      )}

      <Card>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {t(`onboarding.step.${step}` as MessageKey)}
        </h1>
        <p className="mt-1 text-muted-foreground">{t(`onboarding.step.${step}.help` as MessageKey)}</p>

        <div className="mt-6">
          {step === 'review' ? (
            <ReviewStep values={values} onEdit={(s) => goTo(ONBOARDING_STEPS.indexOf(s))} onBack={() => goTo(stepIndex - 1)} />
          ) : (
            <StepForm
              key={step}
              config={STEPS[step]}
              values={values}
              isFirst={stepIndex === 0}
              onBack={() => goTo(stepIndex - 1)}
              onDone={(next, skipped) => {
                if (!skipped) setValues((v) => ({ ...v, ...next }))
                goTo(stepIndex + 1)
              }}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

function StepForm({
  config,
  values,
  isFirst,
  onBack,
  onDone,
}: {
  config: StepConfig
  values: Values
  isFirst: boolean
  onBack: () => void
  onDone: (values: Partial<Values>, skipped?: boolean) => void
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<MessageKey | null>(null)
  const form = useForm<FieldValues>({
    resolver: zodResolver(config.schema),
    defaultValues: pick(values, config.schema),
    mode: 'onTouched',
  })

  const field: FieldBinder = (name) => ({
    registration: form.register(name),
    error: form.formState.errors[name]?.message as string | undefined,
  })

  const onSubmit = form.handleSubmit(() => {
    // Send the raw strings; the server validates and normalises them again.
    const raw = form.getValues() as Partial<Values>
    const merged = { ...values, ...raw }
    setFormError(null)
    if (!config.save) {
      onDone(raw)
      return
    }
    startTransition(async () => {
      const result = await config.save!(merged)
      if (result.ok) {
        onDone(raw)
        return
      }
      for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(name as Path<FieldValues>, { message })
      }
      setFormError(result.fieldErrors ? 'errors.validation' : result.error)
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <config.Fields field={field} />
      <FormError message={formError ? t(formError) : null} />
      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {!isFirst ? (
          <Button variant="secondary" onClick={onBack} disabled={pending}>
            {t('common.back')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          {config.optional && (
            <Button variant="ghost" onClick={() => onDone({}, true)} disabled={pending}>
              {t('common.skip')}
            </Button>
          )}
          <Button type="submit" loading={pending}>
            {pending ? t('common.saving') : t('common.next')}
          </Button>
        </div>
      </div>
    </form>
  )
}

function ReviewStep({
  values,
  onEdit,
  onBack,
}: {
  values: Values
  onEdit: (step: OnboardingStep) => void
  onBack: () => void
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<MessageKey | null>(null)
  const dash = (v?: string) => (v && v.trim() ? v : t('common.notAdded'))
  const language = LANGUAGES.find((l) => l.code === values.preferredLanguage)

  const sections: { step: OnboardingStep; rows: [string, string][] }[] = [
    { step: 'name', rows: [[t('field.businessName'), dash(values.business_name)]] },
    {
      step: 'category',
      rows: [[t('field.category'), values.business_category ? t(`category.${values.business_category}` as MessageKey) : dash()]],
    },
    {
      step: 'contact',
      rows: [
        [t('field.ownerName'), dash(values.ownerName)],
        [t('field.phone'), dash(values.phone)],
        [t('field.whatsapp'), dash(values.whatsapp_number)],
        [t('field.email'), dash(values.email)],
      ],
    },
    {
      step: 'location',
      rows: [
        [t('field.addressLine'), dash(values.address_line)],
        [t('field.village'), dash(values.village)],
        [t('field.district'), dash(values.district)],
        [t('field.state'), dash(values.state)],
        [t('field.pincode'), dash(values.pincode)],
      ],
    },
    { step: 'language', rows: [[t('field.language'), language?.nativeLabel ?? dash()]] },
    {
      step: 'brand',
      rows: [
        [t('field.tagline'), dash(values.brand_tagline)],
        [t('field.openingHours'), dash(values.opening_hours)],
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <section key={section.step} className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t(`onboarding.step.${section.step}` as MessageKey)}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(section.step)}
              aria-label={`${t('common.edit')}: ${t(`onboarding.step.${section.step}` as MessageKey)}`}
            >
              <Pencil aria-hidden className="size-4" />
              {t('common.edit')}
            </Button>
          </div>
          <dl className="mt-2 grid gap-1 text-sm">
            {section.rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <FormError message={error ? t(error) : null} />
      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          {t('common.back')}
        </Button>
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await finishOnboarding() // redirects to /dashboard on success
              if (result && !result.ok) setError(result.error)
            })
          }
        >
          {t('onboarding.finishButton')}
        </Button>
      </div>
    </div>
  )
}
