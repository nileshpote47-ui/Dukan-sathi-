'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cancelSubscription } from '@/app/dashboard/billing/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Cancel at the end of the current period (paid access continues until then). */
export function CancelSubscriptionButton({ until }: { until: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await cancelSubscription()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(t('billing.cancelRequested'))
      router.refresh()
    })

  return (
    <>
      <Button variant="secondary" onClick={() => { setError(null); setOpen(true) }} className="text-destructive">
        {t('billing.cancel')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('billing.cancelTitle')} description={t('billing.cancelBody', { date: until })} closeLabel={t('common.close')}>
        <ActionError messageKey={error} />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t('billing.keepPlan')}
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending}>
            {t('billing.confirmCancel')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
