'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/ui/states'
import { exampleGroupFor } from '@/lib/config/category-examples'
import { CONTENT_TYPES } from '@/lib/config/content'
import { LANGUAGES } from '@/lib/config/languages'
import type { ContentTemplate } from '@/lib/data/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { contentFormSchema, type ContentFormInput } from '@/lib/validation/content'
import type { ActionResult } from '@/lib/validation/result'
import { TemplateCard } from './template-card'

type Field = keyof ContentFormInput

/** Templates that fit this content type and business category. */
export function compatibleTemplates(templates: ContentTemplate[], type: string, category: string) {
  return templates.filter(
    (tpl) =>
      (type === 'OTHER' || tpl.content_type === type) &&
      (tpl.business_categories.length === 0 || tpl.business_categories.includes(category)),
  )
}

/**
 * The single content form, used by the create flow (details step) and the edit page.
 * `onSubmit` receives the raw form values; the server validates them again.
 */
export function ContentForm({
  initialValues,
  templates,
  category,
  showTypeSelect,
  submitLabel,
  secondaryAction,
  onSubmit,
}: {
  initialValues: ContentFormInput
  templates: ContentTemplate[]
  category: string
  showTypeSelect: boolean
  submitLabel: string
  secondaryAction?: React.ReactNode
  onSubmit: (values: ContentFormInput) => Promise<ActionResult<unknown> | void>
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<MessageKey | null>(null)
  const form = useForm({
    resolver: zodResolver(contentFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })

  const type = useWatch({ control: form.control, name: 'content_type' })
  const templateId = useWatch({ control: form.control, name: 'template_id' }) ?? ''
  const options = useMemo(() => compatibleTemplates(templates, type, category), [templates, type, category])
  const group = exampleGroupFor(category)
  const example = (field: 'title' | 'product' | 'offer' | 'price') =>
    `${t('common.example')} ${t(`example.${group}.${field}` as MessageKey)}`

  const bind = (name: Field) => ({ registration: form.register(name), error: form.formState.errors[name]?.message })

  const selectTemplate = (id: string) => {
    form.setValue('template_id', id, { shouldDirty: true })
    const tpl = templates.find((x) => x.id === id)
    // Pre-fill the call to action from the template, but never overwrite the owner's text.
    if (tpl?.default_cta && !form.getValues('call_to_action')?.trim()) {
      form.setValue('call_to_action', tpl.default_cta, { shouldDirty: true })
    }
  }

  const submit = form.handleSubmit(
    () => {
      setFormError(null)
      startTransition(async () => {
        const result = await onSubmit(form.getValues())
        if (result && !result.ok) {
          for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
            form.setError(name as Field, { message })
          }
          setFormError(result.fieldErrors ? 'errors.validation' : result.error)
        }
      })
    },
    () => setFormError('errors.validation'),
  )

  const text = (name: Field, label: MessageKey, opts: { placeholder?: string; hint?: string; optional?: boolean; max: number }) => {
    const f = bind(name)
    return (
      <FormField label={t(label)} error={f.error} hint={opts.hint} optional={opts.optional}>
        <Input {...f.registration} placeholder={opts.placeholder} maxLength={opts.max} />
      </FormField>
    )
  }

  const description = bind('description')
  const notes = bind('notes')
  const language = bind('language')
  const typeField = bind('content_type')

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {showTypeSelect && (
        <FormField label={t('contentField.type')} error={typeField.error}>
          <Select {...typeField.registration}>
            {CONTENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`contentType.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      {text('title', 'contentField.title', { placeholder: example('title'), hint: t('contentField.titleHint'), max: 120 })}
      {text('product_name', 'contentField.product', { placeholder: example('product'), optional: true, max: 120 })}
      {text('offer_text', 'contentField.offer', { placeholder: example('offer'), optional: true, max: 300 })}
      {text('price', 'contentField.price', { placeholder: example('price'), optional: true, max: 50 })}
      <FormField label={t('contentField.description')} error={description.error} optional>
        <Textarea {...description.registration} placeholder={t('contentField.descriptionPlaceholder')} rows={3} maxLength={1000} />
      </FormField>
      {text('call_to_action', 'contentField.cta', { placeholder: t('contentField.ctaPlaceholder'), optional: true, max: 120 })}
      <FormField label={t('contentField.language')} error={language.error}>
        <Select {...language.registration}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel}
            </option>
          ))}
        </Select>
      </FormField>

      {options.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">
            {t('contentField.template')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
          </legend>
          <p className="mb-2 text-sm text-muted-foreground">{t('contentField.templateHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <TemplateCard
              template={null}
              name="template_id"
              checked={!templateId}
              onSelect={selectTemplate}
              noneLabel={t('contentField.noTemplate')}
            />
            {options.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                name="template_id"
                checked={templateId === tpl.id}
                onSelect={selectTemplate}
                noneLabel={t('contentField.noTemplate')}
              />
            ))}
          </div>
        </fieldset>
      )}

      <FormField label={t('contentField.notes')} error={notes.error} optional>
        <Textarea {...notes.registration} rows={2} maxLength={1000} />
      </FormField>

      <FormError message={formError ? t(formError) : null} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {secondaryAction ?? <span />}
        <Button type="submit" loading={pending}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
      </div>
    </form>
  )
}
