import { Sparkles } from 'lucide-react'
import type { ContentType } from '@/lib/config/content'
import type { Translate } from '@/lib/i18n'
import { copyToPlainText, outputFieldsFor } from '@/services/ai/output'
import type { AIContentResponse } from '@/services/ai/types'
import { aiFieldLabelKey } from './ai-field-label'
import { CopyTextButton } from './copy-text-button'

/** Read-only display of saved AI copy (detail page), clearly labelled as AI-generated. */
export function AICopyView({
  type,
  copy,
  t,
  generatedLabel,
}: {
  type: ContentType
  copy: AIContentResponse
  t: Translate
  generatedLabel?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
          <Sparkles aria-hidden className="size-3.5" />
          {t('ai.resultBadge')}
        </span>
        <CopyTextButton text={copyToPlainText(type, copy)} />
      </div>
      <dl className="grid gap-3">
        {outputFieldsFor(type).map((field) => {
          const value = field === 'hashtags' ? copy.hashtags?.join(' ') : copy[field]
          if (!value) return null
          return (
            <div key={field}>
              <dt className="text-sm text-muted-foreground">{t(aiFieldLabelKey(type, field))}</dt>
              <dd className={field === 'headline' || field === 'reel_hook' ? 'font-semibold break-words' : 'break-words whitespace-pre-line'}>
                {value}
              </dd>
            </div>
          )
        })}
      </dl>
      {generatedLabel && <p className="text-xs text-muted-foreground">{generatedLabel}</p>}
    </div>
  )
}
