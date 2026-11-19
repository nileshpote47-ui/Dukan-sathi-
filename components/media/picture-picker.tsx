'use client'

import { Check, ImageOff, ImagePlus, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { generatePicture, uploadPicture } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { ActionError } from '@/components/billing/action-error'
import type { AspectRatio } from '@/lib/config/media'
import { resizeForUpload } from '@/lib/media/browser-image'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

export interface Picture {
  id: string
  url: string | null
  ai: boolean
}

interface PicturePickerProps {
  contentId: string
  pictures: Picture[]
  selectedId: string | null
  onSelect: (picture: Picture | null) => void
  /** Called when a new picture was added (uploaded or generated), so parents can share the list. */
  onAdded?: (picture: Picture) => void
  aiAvailable: boolean
  generate: { purpose: 'poster' | 'scene'; aspect_ratio: AspectRatio; template?: string; visual?: string }
  disabled?: boolean
}

/**
 * Choose a picture: none, one of the owner's pictures, a new upload, or (when configured)
 * one AI picture. Uploads and generation happen only on button press; a ref guard stops
 * double submissions while a request is running.
 */
export function PicturePicker({ contentId, pictures, selectedId, onSelect, onAdded, aiAvailable, generate, disabled }: PicturePickerProps) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState<'upload' | 'generate' | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)

  async function run(kind: 'upload' | 'generate', task: () => Promise<Picture | null>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind)
    setError(null)
    try {
      const picture = await task()
      if (picture) {
        onAdded?.(picture)
        onSelect(picture)
      }
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return
    void run('upload', async () => {
      let blob: Blob
      try {
        blob = await resizeForUpload(file)
      } catch {
        setError('media.error.notImage')
        return null
      }
      const form = new FormData()
      form.set('file', blob, 'photo.jpg')
      form.set('content_id', contentId)
      const result = await uploadPicture(form)
      if (!result.ok || !result.data) {
        setError(result.ok ? 'errors.saveFailed' : result.error)
        return null
      }
      return { id: result.data.id, url: result.data.url, ai: false }
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  function onGenerate() {
    void run('generate', async () => {
      const result = await generatePicture({ content_id: contentId, ...generate })
      if (!result.ok || !result.data) {
        setError(result.ok ? 'errors.saveFailed' : result.error)
        return null
      }
      return { id: result.data.id, url: result.data.url, ai: true }
    })
  }

  const locked = disabled || busy !== null

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('media.picture.title')} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        <button
          type="button"
          role="radio"
          aria-checked={selectedId === null}
          onClick={() => onSelect(null)}
          disabled={locked}
          className={cn(
            'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border bg-card p-1 text-center text-xs text-muted-foreground',
            selectedId === null && 'border-primary ring-2 ring-primary',
          )}
        >
          <ImageOff aria-hidden className="size-5" />
          {t('media.picture.none')}
        </button>
        {pictures.map((picture, i) => (
          <button
            key={picture.id}
            type="button"
            role="radio"
            aria-checked={selectedId === picture.id}
            aria-label={t('media.picture.option', { n: i + 1 })}
            onClick={() => onSelect(picture)}
            disabled={locked || !picture.url}
            className={cn('relative aspect-square overflow-hidden rounded-lg border bg-muted', selectedId === picture.id && 'border-primary ring-2 ring-primary')}
          >
            {picture.url && (
              // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable
              <img src={picture.url} alt="" loading="lazy" className="size-full object-cover" />
            )}
            {picture.ai && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">AI</span>}
            {selectedId === picture.id && <Check aria-hidden className="absolute top-1 right-1 size-5 rounded-full bg-primary p-0.5 text-primary-foreground" />}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={`upload-${generate.purpose}`}
          aria-label={t('media.picture.upload')}
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={locked}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={busy === 'upload'} disabled={locked}>
          <ImagePlus aria-hidden className="size-4" />
          {busy === 'upload' ? t('media.picture.uploading') : t('media.picture.upload')}
        </Button>
        {aiAvailable && (
          <Button type="button" variant="secondary" size="sm" onClick={onGenerate} loading={busy === 'generate'} disabled={locked}>
            <Sparkles aria-hidden className="size-4" />
            {busy === 'generate' ? t('media.picture.generating') : t('media.picture.generate')}
          </Button>
        )}
      </div>
      {aiAvailable && <p className="text-xs text-muted-foreground">{t('media.picture.aiHint')}</p>}
      <ActionError messageKey={error} />
    </div>
  )
}
