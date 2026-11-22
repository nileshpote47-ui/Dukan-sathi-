'use client'

import { Download, Mic } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { generateVoiceoverAction } from '@/app/dashboard/content/[id]/storyboard/actions'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { DEFAULT_VOICE, VOICES, type VoiceId } from '@/lib/config/voiceover'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

/*
 * Reel voiceover (Phase 9, Stage 3b): the owner's own voiceover lines from the SAVED storyboard are read
 * aloud in the reel's language. One explicit tap = one metered voiceover. The result plays with the preview
 * and can be downloaded as MP3.
 */
export function VoiceoverPanel({
  contentId,
  available,
  remaining,
  hasLines,
  editable,
  current,
}: {
  contentId: string
  available: boolean
  remaining: number | null
  /** The saved storyboard has at least one voiceover line. */
  hasLines: boolean
  editable: boolean
  current: { url: string; downloadUrl: string | null; voice: VoiceId } | null
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [voice, setVoice] = useState<VoiceId>(current?.voice ?? DEFAULT_VOICE)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()
  const outOfUses = remaining !== null && remaining <= 0
  const blocked = !available || !hasLines || !editable || outOfUses

  const generate = () =>
    startTransition(async () => {
      setError(null)
      const result = await generateVoiceoverAction({ content_id: contentId, voice })
      if (!result.ok) return setError(result.error)
      router.refresh()
    })

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-indigo">
          <Mic aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base">{t('voiceover.title')}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('voiceover.body')}</p>
        </div>
      </div>

      {current && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
          <p className="text-sm font-medium">{t('voiceover.current')}</p>
          <audio controls src={current.url} preload="none" className="w-full" aria-label={t('voiceover.player')} />
          {current.downloadUrl && (
            <a
              href={current.downloadUrl}
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <Download aria-hidden className="size-4" />
              {t('voiceover.download')}
            </a>
          )}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t('voiceover.voice')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {VOICES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={voice === option.id}
              onClick={() => setVoice(option.id)}
              className={cn(
                'min-h-11 rounded-xl border-2 px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ring',
                voice === option.id ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/60',
              )}
            >
              {t(option.label as MessageKey)}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {t(error)}
        </p>
      )}

      <Button type="button" onClick={generate} disabled={blocked || pending}>
        {pending ? <Spinner className="size-4" /> : <Mic aria-hidden className="size-4" />}
        {pending ? t('voiceover.making') : current ? t('voiceover.again') : t('voiceover.make')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {!available
          ? t('voiceover.error.notConfigured')
          : !hasLines
            ? t('voiceover.needLines')
            : outOfUses
              ? t('billing.limit.voiceover')
              : remaining === null
                ? t('voiceover.costOne')
                : t('voiceover.cost', { remaining: Math.max(remaining, 0) })}
      </p>
    </Card>
  )
}
