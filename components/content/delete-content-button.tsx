'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteContent } from '@/app/dashboard/content/actions'
import { Button, type ButtonSize } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Delete with an explicit confirmation dialog. */
export function DeleteContentButton({
  id,
  title,
  redirectTo,
  size = 'md',
}: {
  id: string
  title: string
  /** Where to go after deleting; omitted = stay and refresh. */
  redirectTo?: string
  size?: ButtonSize
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteContent(id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(t('content.deleted'))
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    })

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="text-destructive"
        aria-label={`${t('content.delete')}: ${title}`}
      >
        <Trash2 aria-hidden className="size-4" />
        {t('content.delete')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('content.deleteTitle')}
        description={t('content.deleteBody', { title })}
        closeLabel={t('common.close')}
      >
        <FormError message={error ? t(error) : null} />
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending}>
            {t('content.deleteConfirm')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
