'use client'

import { ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { uploadPicture } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { resizeForUpload } from '@/lib/media/browser-image'
import { useI18n } from '@/lib/i18n/provider'

/** Upload a photo to the media library (resized in the browser, checked on the server). */
export function UploadPictureButton() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const blob = await resizeForUpload(file).catch(() => null)
      if (!blob) {
        toast.error(t('media.error.notImage'))
        return
      }
      const form = new FormData()
      form.set('file', blob, 'photo.jpg')
      const result = await uploadPicture(form)
      if (!result.ok) {
        toast.error(t(result.error))
        return
      }
      toast.success(t('media.uploaded'))
      router.refresh()
    } finally {
      busyRef.current = false
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={t('media.picture.upload')}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} loading={busy}>
        <ImagePlus aria-hidden className="size-4" />
        {busy ? t('media.picture.uploading') : t('media.picture.upload')}
      </Button>
    </>
  )
}
