'use client'

import Link from 'next/link'
import { isLimitError } from '@/lib/config/billing'
import { AlertTriangle, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { useId, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { AI_INSTRUCTIONS_MAX, REGENERATE_SUGGESTIONS } from '@/lib/config/ai'
import type { ContentType } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'
import type { ActionResult } from '@/lib/validation/result'
import { outputFieldsFor } from '@/services/ai/output'
import type { AIContentResponse, OutputField } from '@/services/ai/types'
import { aiFieldLabelKey } from './ai-field-label'

type GenerateFn = (options: {
  instructions: string
  previous: AIContentResponse | null
}) => Promise<ActionResult<{ content: AIContentResponse }>>

const LONG_FIELDS: OutputField[] = ['primary_text', 'reel_script', 'short_text']

/**
 * Generate → review → edit → regenerate. Generation only happens when the owner presses a
 * button (never automatically), and duplicate clicks are ignored while a request runs.
 * Regenerating never overwrites saved content by itself: the new version stays in the
 * editor until the owner saves, and the previous version can be restored.
 */
export function AIContentPanel({
  type,
  value,
  onChange,
  onGenerate,
  available,
  footer,
}: {
  type: ContentType
  value: AIContentResponse | null
  /** generated = true when the value came from the AI (not a manual edit). */
  onChange: (value: AIContentResponse | null, meta: { generated: boolean }) => void
  onGenerate: GenerateFn
  available: boolean
  footer?: React.ReactNode
}) {
  const { t } = useI18n()
  const instructionsId = useId()
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [previousVersion, setPreviousVersion] = useState<AIContentResponse | null>(null)
  const [pending, startTransition] = useTransition()
  const running = useRef(false)
  const [lastRequest, setLastRequest] = useState<{ instructions: string; previous: AIContentResponse | null } | null>(null)

  const run = (request: { instructions: string; previous: AIContentResponse | null }) => {
    if (running.current) return // no duplicate submissions
    running.current = true
    setLastRequest(request)
    setError(null)
    startTransition(async () => {
      try {
        const result = await onGenerate(request)
        if (!result.ok) {
          setError(result.error)
          return
        }
        if (value) setPreviousVersion(value)
        onChange(result.data!.content, { generated: true })
        setInstructions('')
      } catch {
        setError('ai.error.failed')
      } finally {
        running.current = false
      }
    })
  }

  const fields = outputFieldsFor(type)

  return (
    <section aria-labelledby="ai-panel-title" className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-panel-title" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles aria-hidden className="size-5 text-primary" />
          {value ? t('ai.resultTitle') : t('ai.generate')}
        </h3>
        {value && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
            <Sparkles aria-hidden className="size-3.5" />
            {t('ai.resultBadge')}
          </span>
        )}
      </div>

      {!available ? (
        <p role="note" className="rounded-xl bg-card p-3 text-sm">
          {t('ai.error.notConfigured')}
        </p>
      ) : !value ? (
        <>
          <p className="text-sm text-muted-foreground">{t('ai.generateHint')}</p>
          <FormField label={t('ai.instructionsLabel')} optional>
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={AI_INSTRUCTIONS_MAX}
              placeholder={t('ai.instructionsPlaceholder')}
              disabled={pending}
            />
          </FormField>
          <Button onClick={() => run({ instructions, previous: null })} loading={pending} size="lg" className="self-start">
            {!pending && <Sparkles aria-hidden className="size-4" />}
            {pending ? t('ai.generating') : t('ai.generate')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t('ai.reviewHint')}</p>
          <div className={cn('flex flex-col gap-4', pending && 'opacity-60')} aria-busy={pending || undefined}>
            {fields.map((field) => (
              <CopyField
                key={field}
                label={t(aiFieldLabelKey(type, field))}
                field={field}
                value={value}
                disabled={pending}
                hint={field === 'hashtags' ? t('aiField.hashtagsHint') : undefined}
                onChange={(next) => onChange(next, { generated: false })}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
            <p className="text-sm text-muted-foreground">{t('ai.regenerateHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ai.regenerate')}>
              {REGENERATE_SUGGESTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={pending}
                  onClick={() => setInstructions(s.instruction)}
                  aria-pressed={instructions === s.instruction}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
                    instructions === s.instruction ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-muted',
                  )}
                >
                  {t(s.key)}
                </button>
              ))}
            </div>
            <label htmlFor={instructionsId} className="sr-only">
              {t('ai.instructionsLabel')}
            </label>
            <Input
              id={instructionsId}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={AI_INSTRUCTIONS_MAX}
              placeholder={t('ai.instructionsPlaceholder')}
              disabled={pending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => run({ instructions, previous: value })} loading={pending}>
                {!pending && <RotateCcw aria-hidden className="size-4" />}
                {pending ? t('ai.generating') : t('ai.regenerate')}
              </Button>
              {previousVersion && !pending && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onChange(previousVersion, { generated: false })
                    setPreviousVersion(null)
                  }}
                >
                  <Undo2 aria-hidden className="size-4" />
                  {t('ai.undo')}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {pending && (
        <p role="status" className="text-sm font-medium text-primary">
          {t('ai.generating')}
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive-soft p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle aria-hidden className="size-4" />
            {t('ai.failedTitle')}
          </p>
          <p>{t(error)}</p>
          {isLimitError(error) && (
            <Link href="/dashboard/billing" className="self-start font-semibold underline underline-offset-4">
              {t('billing.viewPlans')}
            </Link>
          )}
          {error !== 'ai.error.notConfigured' && !isLimitError(error) && lastRequest && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => run(lastRequest)} disabled={pending}>
              {t('ai.tryAgain')}
            </Button>
          )}
        </div>
      )}

      {footer}
    </section>
  )
}

/** One editable output field. Hashtags are edited as space-separated text. */
function CopyField({
  label,
  field,
  value,
  disabled,
  hint,
  onChange,
}: {
  label: string
  field: OutputField
  value: AIContentResponse
  disabled: boolean
  hint?: string
  onChange: (next: AIContentResponse) => void
}) {
  const [hashtagText, setHashtagText] = useState(() => (value.hashtags ?? []).join(' '))
  const [lastTags, setLastTags] = useState(value.hashtags)
  // Keep the hashtag text in sync when a new version arrives (render-time sync, no effect needed).
  if (field === 'hashtags' && value.hashtags !== lastTags) {
    setLastTags(value.hashtags)
    setHashtagText((value.hashtags ?? []).join(' '))
  }

  if (field === 'hashtags') {
    return (
      <FormField label={label} hint={hint}>
        <Input
          value={hashtagText}
          disabled={disabled}
          onChange={(e) => setHashtagText(e.target.value)}
          onBlur={() => {
            const tags = hashtagText
              .split(/[\s,]+/)
              .map((w) => w.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
              .filter(Boolean)
              .slice(0, 8)
              .map((w) => `#${w.slice(0, 40)}`)
            const next = { ...value, hashtags: tags.length ? tags : undefined }
            setLastTags(next.hashtags)
            setHashtagText(tags.join(' '))
            onChange(next)
          }}
        />
      </FormField>
    )
  }

  const text = value[field] ?? ''
  const update = (next: string) => onChange({ ...value, [field]: next })
  return (
    <FormField label={label}>
      {LONG_FIELDS.includes(field) ? (
        <Textarea value={text} rows={field === 'reel_script' ? 6 : 4} disabled={disabled} onChange={(e) => update(e.target.value)} maxLength={2000} />
      ) : (
        <Input value={text} disabled={disabled} onChange={(e) => update(e.target.value)} maxLength={250} />
      )}
    </FormField>
  )
}
