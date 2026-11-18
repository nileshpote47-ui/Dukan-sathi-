'use client'

import { Pencil, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createContent } from '@/app/dashboard/content/actions'
import { ContentForm } from '@/components/content/content-form'
import { ContentPreview } from '@/components/content/content-preview'
import { ContentTypeCard } from '@/components/content/content-type-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { CONTENT_TYPES, type ContentType } from '@/lib/config/content'
import type { ContentTemplate } from '@/lib/data/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import type { ContentFormInput } from '@/lib/validation/content'

const STEPS = ['type', 'details', 'review'] as const
type Step = (typeof STEPS)[number]

/**
 * Step 1 choose type → Step 2 details → Step 3 review → Save as draft.
 * One reusable flow; dashboard quick actions open it with ?type= preselected.
 * Nothing is generated: the result is a draft content_items record.
 */
export function CreateFlow({
  initialType,
  templates,
  category,
  defaults,
}: {
  initialType: ContentType | null
  templates: ContentTemplate[]
  category: string
  defaults: { language: ContentFormInput['language']; callToAction: string }
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const [step, setStep] = useState<Step>(initialType ? 'details' : 'type')
  const [values, setValues] = useState<ContentFormInput>({
    content_type: initialType ?? 'POST',
    title: '',
    product_name: '',
    offer_text: '',
    price: '',
    description: '',
    call_to_action: defaults.callToAction,
    notes: '',
    language: defaults.language,
    template_id: '',
  })
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<MessageKey | null>(null)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [step])

  const index = STEPS.indexOf(step)
  const template = templates.find((tpl) => tpl.id === values.template_id)

  const save = () =>
    startSaving(async () => {
      setSaveError(null)
      const result = await createContent(values)
      if (!result.ok) {
        setSaveError(result.fieldErrors ? 'errors.validation' : result.error)
        return
      }
      toast.success(t('create.saved'))
      router.push(`/dashboard/content/${result.data!.id}`)
    })

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4">
        <p className="text-sm font-medium text-muted-foreground">{t('create.stepOf', { current: index + 1, total: STEPS.length })}</p>
        <Progress
          value={((index + 1) / STEPS.length) * 100}
          label={t('create.stepOf', { current: index + 1, total: STEPS.length })}
          className="mt-2"
        />
      </div>

      <p role="note" className="mb-4 flex items-start gap-2 rounded-xl bg-accent-soft p-3 text-sm">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('ai.notice')}
      </p>

      <Card>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          {t(`create.step.${step}` as MessageKey)}
        </h2>

        {step !== 'type' && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t('contentField.type')}: <strong className="text-foreground">{t(`contentType.${values.content_type}` as MessageKey)}</strong>
            </span>
            <Button variant="link" size="sm" onClick={() => setStep('type')} disabled={saving}>
              <Pencil aria-hidden className="size-3.5" />
              {t('create.changeType')}
            </Button>
          </p>
        )}

        <div className="mt-5">
          {step === 'type' && (
            <fieldset>
              <legend className="sr-only">{t('create.step.type')}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CONTENT_TYPES.map((type) => (
                  <ContentTypeCard
                    key={type}
                    type={type}
                    t={t}
                    name="content_type"
                    checked={values.content_type === type}
                    onSelect={(chosen) => {
                      setValues((v) => ({ ...v, content_type: chosen, template_id: '' }))
                      setStep('details')
                    }}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {step === 'details' && (
            <ContentForm
              key={values.content_type}
              initialValues={values}
              templates={templates}
              category={category}
              showTypeSelect={false}
              submitLabel={t('create.toReview')}
              secondaryAction={
                <Button variant="secondary" onClick={() => setStep('type')}>
                  {t('common.back')}
                </Button>
              }
              onSubmit={async (next) => {
                setValues(next)
                setStep('review')
              }}
            />
          )}

          {step === 'review' && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-sm text-muted-foreground">{t('contentField.title')}</p>
                <p className="text-lg font-semibold break-words">{values.title}</p>
              </div>
              <ContentPreview values={values} templateName={template?.name} t={t} />
              <FormError message={saveError ? t(saveError) : null} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="secondary" onClick={() => setStep('details')} disabled={saving}>
                  <Pencil aria-hidden className="size-4" />
                  {t('common.edit')}
                </Button>
                <Button onClick={save} loading={saving}>
                  {saving ? t('common.saving') : t('create.saveDraft')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
