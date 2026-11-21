'use client'

import { RefreshCw, Sparkles, Wand2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { confirmDirectPosterAction, generateDirectPosterAction } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { AspectRatio } from '@/lib/config/media'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import type { PosterTexts } from '@/lib/media/poster-layout'

/*
 * "Let AI design the whole poster" (Phase 9). Uses the same lines, size and style as the template
 * editor; the owner's words go to the image model exactly as typed. The result is stored but can
 * only be used (published) after the owner ticks that the spelling, price and offer are correct.
 */
export function DirectPosterPanel({
  contentId,
  template,
  aspectRatio,
  texts,
  available,
  remaining,
}: {
  contentId: string
  template: string
  aspectRatio: AspectRatio
  texts: PosterTexts
  available: boolean
  remaining: number | null
}) {
  const { t } = useI18n()
  const router = useRouter()
  const checkId = useId()
  const [result, setResult] = useState<{ id: string; url: string | null } | null>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [left, setLeft] = useState(remaining)
  const [generating, startGenerating] = useTransition()
  const [confirming, startConfirming] = useTransition()
  const outOfUses = left !== null && left <= 0

  const generate = () =>
    startGenerating(async () => {
      setError(null)
      setChecked(false)
      const response = await generateDirectPosterAction({ content_id: contentId, template, aspect_ratio: aspectRatio, texts })
      if (!response.ok) return setError(response.error)
      setResult(response.data!)
      setLeft((n) => (n === null ? n : n - 1))
    })

  const confirm = () =>
    startConfirming(async () => {
      if (!result) return
      const response = await confirmDirectPosterAction(result.id)
      if (!response.ok) return setError(response.error)
      router.push(`/dashboard/media/${result.id}`)
    })

  return (
    <Card className="flex flex-col gap-3 border-2 border-dashed border-primary/40">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Wand2 aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base">{t('directPoster.title')}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('directPoster.body')}</p>
        </div>
      </div>

      {result?.url && (
        <figure className="flex flex-col gap-2">
          {/* Signed URL of the owner's own private file. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt={t('directPoster.resultAlt')} className="w-full rounded-xl border border-border" />
          <figcaption className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-foreground">{t('directPoster.checkHint')}</figcaption>
        </figure>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}

      {result ? (
        <div className="flex flex-col gap-3">
          <label htmlFor={checkId} className="flex items-start gap-2 text-sm font-medium">
            <input id={checkId} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
            {t('directPoster.checkbox')}
          </label>
          <Button onClick={confirm} disabled={!checked || confirming} fullWidth>
            {confirming ? <Spinner className="size-4" /> : <Sparkles aria-hidden className="size-4" />}
            {t('directPoster.use')}
          </Button>
          <Button variant="secondary" onClick={generate} disabled={generating || outOfUses} fullWidth>
            {generating ? <Spinner className="size-4" /> : <RefreshCw aria-hidden className="size-4" />}
            {generating ? t('directPoster.making') : t('directPoster.again')}
          </Button>
        </div>
      ) : (
        <Button onClick={generate} disabled={!available || generating || outOfUses || !texts.headline.trim()} fullWidth>
          {generating ? <Spinner className="size-4" /> : <Wand2 aria-hidden className="size-4" />}
          {generating ? t('directPoster.making') : t('directPoster.make')}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {!available
          ? t('ai.error.notConfigured')
          : left === null
            ? t('directPoster.costOne')
            : t('directPoster.cost', { remaining: Math.max(left, 0) })}
        {generating && ` ${t('directPoster.wait')}`}
      </p>
    </Card>
  )
}
