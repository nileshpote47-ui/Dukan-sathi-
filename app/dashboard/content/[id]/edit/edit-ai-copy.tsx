'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { generateWithAI, saveContentCopy } from '@/app/dashboard/content/ai-actions'
import { AIContentPanel } from '@/components/ai/ai-content-panel'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { ContentType } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import type { ContentFormInput } from '@/lib/validation/content'
import type { AIContentResponse } from '@/services/ai/types'

/**
 * AI copy on the edit page. Generates from the content's SAVED details. A new version
 * stays in the editor (with undo) until the owner presses Save — saved content is never
 * overwritten automatically.
 */
export function EditAICopy({
  id,
  type,
  request,
  initialCopy,
  aiAvailable,
}: {
  id: string
  type: ContentType
  request: ContentFormInput
  initialCopy: AIContentResponse | null
  aiAvailable: boolean
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [copy, setCopy] = useState(initialCopy)
  const [dirty, setDirty] = useState(false)
  const [regenerated, setRegenerated] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [saving, startSaving] = useTransition()

  const save = () =>
    startSaving(async () => {
      setError(null)
      const result = await saveContentCopy({ id, copy, regenerated })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDirty(false)
      setRegenerated(false)
      toast.success(t('ai.copySaved'))
      router.refresh()
    })

  return (
    <AIContentPanel
      type={type}
      value={copy}
      available={aiAvailable}
      onChange={(next, { generated }) => {
        setCopy(next)
        setDirty(true)
        if (generated) setRegenerated(true)
      }}
      onGenerate={({ instructions, previous }) => generateWithAI({ ...request, instructions, previous })}
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('ai.usesSavedDetails')}</p>
          {dirty && (
            <p role="status" className="text-sm font-medium">
              {t('ai.unsavedNote')}
            </p>
          )}
          <FormError message={error ? t(error) : null} />
          {copy && (
            <Button onClick={save} loading={saving} disabled={!dirty} className="self-start">
              {saving ? t('common.saving') : t('ai.saveCopy')}
            </Button>
          )}
        </div>
      }
    />
  )
}
