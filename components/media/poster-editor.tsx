'use client'

import { Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { savePoster } from '@/app/dashboard/media/actions'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { ASPECT_RATIO_KEYS, ASPECT_RATIO_LABELS, type AspectRatio } from '@/lib/config/media'
import { getPosterLayout } from '@/lib/config/poster-templates'
import { exportCanvas } from '@/lib/media/browser-image'
import type { PosterTexts } from '@/lib/media/poster-layout'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'
import { PicturePicker, type Picture } from './picture-picker'
import { PosterCanvas } from './poster-canvas'

export interface PosterTemplateOption {
  slug: string
  name: string
  description: string
}

interface PosterEditorProps {
  contentId: string
  templates: PosterTemplateOption[]
  initial: { template: string; aspectRatio: AspectRatio; texts: PosterTexts; imageId: string | null }
  pictures: Picture[]
  aiAvailable: boolean
}

const TEXT_LIMITS: Record<keyof PosterTexts, number> = { headline: 120, body: 400, badge: 60, cta: 80, businessName: 100, footer: 120 }

/**
 * Poster / social creative editor: template → size → texts → picture → live preview → save.
 * The preview canvas is the exported file; the server validates it before storing.
 */
export function PosterEditor({ contentId, templates, initial, pictures: initialPictures, aiAvailable }: PosterEditorProps) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const savingRef = useRef(false)
  const [template, setTemplate] = useState(initial.template)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initial.aspectRatio)
  const [texts, setTexts] = useState<PosterTexts>(initial.texts)
  const [pictures, setPictures] = useState(initialPictures)
  const [picture, setPicture] = useState<Picture | null>(initialPictures.find((p) => p.id === initial.imageId) ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onImageError = useCallback(() => setError(t('media.error.pictureLoad')), [t])

  const setText = (key: keyof PosterTexts, value: string) => setTexts((prev) => ({ ...prev, [key]: value.slice(0, TEXT_LIMITS[key]) }))

  async function onSave() {
    if (savingRef.current || !canvasRef.current) return
    if (!texts.headline.trim()) {
      setError(t('poster.error.headline'))
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const blob = await exportCanvas(canvasRef.current)
      const form = new FormData()
      form.set('file', blob, blob.type === 'image/png' ? 'poster.png' : 'poster.jpg')
      form.set('spec', JSON.stringify({ content_id: contentId, template, aspect_ratio: aspectRatio, texts, image_asset_id: picture?.id ?? null }))
      const result = await savePoster(form)
      if (!result.ok || !result.data) {
        setError(t(result.ok ? 'errors.saveFailed' : result.error))
        return
      }
      toast.success(t('media.posterSaved'))
      router.push(`/dashboard/media/${result.data.id}`)
    } catch {
      // Export can fail if a picture could not be loaded safely or the poster is too large.
      setError(t('media.error.export'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      {/* Preview first on phones: owners see the result while they edit below. */}
      <div className="lg:order-2">
        <div className="lg:sticky lg:top-4">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">{t('poster.preview')}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{aspectRatio}</span>
            </div>
            <div className={cn('mx-auto', aspectRatio === '9:16' ? 'max-w-[18rem]' : aspectRatio === '16:9' ? 'max-w-full' : 'max-w-[24rem]')}>
              <PosterCanvas
                ref={canvasRef}
                template={template}
                aspectRatio={aspectRatio}
                texts={texts}
                imageUrl={picture?.url ?? null}
                label={t('poster.previewLabel')}
                onImageError={onImageError}
              />
            </div>
          </Card>
          <div className="mt-3 flex flex-col gap-2">
            <FormError message={error} />
            <Button type="button" size="lg" fullWidth onClick={onSave} loading={saving}>
              <Save aria-hidden className="size-4" />
              {saving ? t('common.saving') : t('poster.save')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('poster.saveHint')}</p>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:order-1">
        <Card>
          <CardTitle className="mb-3 text-base">{t('poster.chooseTemplate')}</CardTitle>
          <div role="radiogroup" aria-label={t('poster.chooseTemplate')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {templates.map((option) => {
              const layout = getPosterLayout(option.slug)
              const selected = option.slug === template
              return (
                <button
                  key={option.slug}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTemplate(option.slug)}
                  className={cn(
                    'flex min-h-11 flex-col gap-2 rounded-xl border bg-card p-2 text-left text-sm hover:bg-muted',
                    selected && 'border-primary ring-2 ring-primary',
                  )}
                >
                  <span
                    aria-hidden
                    className="h-10 w-full rounded-lg"
                    style={{ background: `linear-gradient(135deg, ${layout.colors.background[0]}, ${layout.colors.background[1]} 60%, ${layout.colors.accent})` }}
                  />
                  <span className="font-medium">{option.name}</span>
                </button>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-3 text-base">{t('poster.chooseSize')}</CardTitle>
          <div role="radiogroup" aria-label={t('poster.chooseSize')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ASPECT_RATIO_KEYS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                role="radio"
                aria-checked={ratio === aspectRatio}
                onClick={() => setAspectRatio(ratio)}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center rounded-xl border bg-card px-2 py-1 text-sm hover:bg-muted',
                  ratio === aspectRatio && 'border-primary ring-2 ring-primary',
                )}
              >
                <span className="font-semibold">{ratio}</span>
                <span className="text-xs text-muted-foreground">{t(ASPECT_RATIO_LABELS[ratio])}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle className="text-base">{t('poster.texts')}</CardTitle>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{t('poster.textsHint')}</p>
          <div className="flex flex-col gap-3">
            <FormField label={t('poster.field.headline')}>
              <Input value={texts.headline} onChange={(e) => setText('headline', e.target.value)} />
            </FormField>
            <FormField label={t('poster.field.body')} optional>
              <Textarea rows={3} value={texts.body} onChange={(e) => setText('body', e.target.value)} />
            </FormField>
            <FormField label={t('poster.field.badge')} optional hint={t('poster.field.badgeHint')}>
              <Input value={texts.badge} onChange={(e) => setText('badge', e.target.value)} />
            </FormField>
            <FormField label={t('poster.field.cta')} optional>
              <Input value={texts.cta} onChange={(e) => setText('cta', e.target.value)} />
            </FormField>
            <FormField label={t('poster.field.businessName')}>
              <Input value={texts.businessName} onChange={(e) => setText('businessName', e.target.value)} />
            </FormField>
            <FormField label={t('poster.field.footer')} optional>
              <Input value={texts.footer} onChange={(e) => setText('footer', e.target.value)} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardTitle className="text-base">{t('media.picture.title')}</CardTitle>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{t('poster.pictureHint')}</p>
          <PicturePicker
            contentId={contentId}
            pictures={pictures}
            selectedId={picture?.id ?? null}
            onSelect={setPicture}
            onAdded={(p) => setPictures((prev) => [p, ...prev])}
            aiAvailable={aiAvailable}
            generate={{ purpose: 'poster', aspect_ratio: aspectRatio, template }}
            disabled={saving}
          />
        </Card>
      </div>
    </div>
  )
}
