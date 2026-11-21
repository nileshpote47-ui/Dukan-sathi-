'use client'

import { Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { writeCopyForContent } from '@/app/dashboard/content/ai-actions'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Content page: write AI copy right here (one explicit tap) instead of going through Edit. */
export function WriteWithAIButton({ contentId }: { contentId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await writeCopyForContent(contentId)
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
        disabled={pending}
      >
        {pending ? <Spinner className="size-4" /> : <Sparkles aria-hidden className="size-4" />}
        {pending ? t('ai.generating') : t('ai.writeNow')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('ai.writeNowHint')}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </div>
  )
}
