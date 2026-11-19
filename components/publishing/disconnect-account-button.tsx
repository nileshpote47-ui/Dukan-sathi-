'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { disconnectAccountAction } from '@/app/dashboard/accounts/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

export function DisconnectAccountButton({ accountId, name, meta }: { accountId: string; name: string; meta: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await disconnectAccountAction(accountId)
      if (!result.ok) return setError(result.error)
      setOpen(false)
      toast.success(t('publishing.accounts.disconnected'))
      router.refresh()
    })

  return (
    <>
      <Button variant="secondary" className="text-destructive" onClick={() => { setError(null); setOpen(true) }}>
        {t('publishing.accounts.disconnect')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('publishing.accounts.disconnectTitle', { name })}
        description={t('publishing.accounts.disconnectBody')}
        closeLabel={t('common.close')}
      >
        {meta && <p className="text-sm text-muted-foreground">{t('publishing.accounts.disconnectMetaNote')}</p>}
        <ActionError messageKey={error} />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending}>
            {t('publishing.accounts.disconnect')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
