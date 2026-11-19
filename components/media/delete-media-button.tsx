'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteMedia } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Delete a media asset (and its file) after confirmation. */
export function DeleteMediaButton({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteMedia(id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(t('media.deleted'))
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    })

  return (
    <>
      <Button variant="secondary" onClick={() => { setError(null); setOpen(true) }} className="text-destructive">
        <Trash2 aria-hidden className="size-4" />
        {t('media.delete')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('media.deleteTitle')} description={t('media.deleteWarning')} closeLabel={t('common.close')}>
        <FormError message={error ? t(error) : null} />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending}>
            {t('media.delete')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
