'use client'

import { ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { confirmDirectPosterAction } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Media page: confirm an AI-designed poster's text, price and offer so it can be published. */
export function ConfirmDirectPoster({ id }: { id: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const checkId = useId()
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, start] = useTransition()
  return (
    <div role="region" aria-label={t('directPoster.reviewTitle')} className="mb-6 flex flex-col gap-3 rounded-2xl border border-accent/50 bg-accent-soft p-4">
      <p className="font-semibold">{t('directPoster.reviewTitle')}</p>
      <p className="text-sm text-accent-foreground">{t('directPoster.checkHint')}</p>
      <label htmlFor={checkId} className="flex items-start gap-2 text-sm font-medium">
        <input id={checkId} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
        {t('directPoster.checkbox')}
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button
        className="self-start"
        disabled={!checked || pending}
        onClick={() =>
          start(async () => {
            const result = await confirmDirectPosterAction(id)
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
      >
        {pending ? <Spinner className="size-4" /> : <ShieldCheck aria-hidden className="size-4" />}
        {t('directPoster.use')}
      </Button>
    </div>
  )
}
