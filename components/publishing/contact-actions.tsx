'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { deleteContactAction, optOutContactAction } from '@/app/dashboard/accounts/actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useI18n } from '@/lib/i18n/provider'

export function ContactActions({ contactId, optedOut }: { contactId: string; optedOut: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (action: (id: string) => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const result = await action(contactId)
      if (result.ok) {
        toast.success(t('publishing.contacts.updated'))
        router.refresh()
      } else toast.error(t('errors.saveFailed'))
    })

  return (
    <div className="flex flex-wrap gap-2">
      {!optedOut && (
        <Button variant="secondary" onClick={() => run(optOutContactAction)} disabled={pending}>
          {t('publishing.contacts.optOut')}
        </Button>
      )}
      <Button variant="ghost" className="text-destructive" onClick={() => run(deleteContactAction)} disabled={pending}>
        {t('publishing.contacts.delete')}
      </Button>
    </div>
  )
}
