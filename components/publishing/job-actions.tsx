'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cancelJobAction, retryJobAction } from '@/app/dashboard/publishing/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Cancel (before publishing) and explicit retry (failed, retryable). */
export function JobActions({ jobId, canCancel, canRetry }: { jobId: string; canCancel: boolean; canRetry: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  if (!canCancel && !canRetry) return null

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelJobAction(jobId)
      if (!result.ok) return setError(result.error)
      setConfirming(false)
      toast.success(t('publishing.cancelled'))
      router.refresh()
    })

  const retry = () =>
    startTransition(async () => {
      setError(null)
      const result = await retryJobAction(jobId)
      if (!result.ok) return setError(result.error)
      toast.success(t('publishing.retried'))
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canRetry && (
          <Button variant="secondary" onClick={retry} loading={pending}>
            {t('publishing.retry')}
          </Button>
        )}
        {canCancel && (
          <Button variant="secondary" className="text-destructive" onClick={() => setConfirming(true)} disabled={pending}>
            {t('publishing.cancel')}
          </Button>
        )}
      </div>
      {!confirming && <ActionError messageKey={error} />}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={t('publishing.cancelTitle')} description={t('publishing.cancelBody')} closeLabel={t('common.close')}>
        <ActionError messageKey={error} />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
            {t('common.back')}
          </Button>
          <Button variant="danger" onClick={cancel} loading={pending}>
            {t('publishing.cancelConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
