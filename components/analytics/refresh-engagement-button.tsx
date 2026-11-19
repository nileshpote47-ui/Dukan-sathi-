'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { refreshEngagementAction } from '@/app/dashboard/analytics/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Fetch the latest likes/comments from the platforms — only when the owner asks. */
export function RefreshEngagementButton() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () =>
    startTransition(async () => {
      setError(null)
      const result = await refreshEngagementAction()
      if (!result.ok) return setError(result.error)
      toast.success(
        result.data?.unavailable
          ? t('analytics.refresh.partial', { n: result.data.updated, failed: result.data.unavailable })
          : t('analytics.refresh.done', { n: result.data?.updated ?? 0 }),
      )
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={refresh} loading={pending}>
        <RefreshCw aria-hidden className="size-4" />
        {t('analytics.refresh.button')}
      </Button>
      <ActionError messageKey={error} />
    </div>
  )
}
