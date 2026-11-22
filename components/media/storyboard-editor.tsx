'use client'

import { ArrowDown, ArrowUp, Clapperboard, Minus, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { generateStoryboard, saveStoryboard } from '@/app/dashboard/content/[id]/storyboard/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input, Select, Textarea } from '@/components/ui/input'
import { ActionError } from '@/components/billing/action-error'
import { useToast } from '@/components/ui/toast'
import { REEL_ASPECT_RATIO, REEL_DURATION, REEL_SCENES, SCENE_DURATION, SCENE_TRANSITIONS, SCENE_TYPES } from '@/lib/config/media'
import { sumDurations, type Storyboard, type StoryboardScene } from '@/lib/media/storyboard'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'
import { PicturePicker, type Picture } from './picture-picker'
import type { StockOptions } from './stock-photo-search'
import { ReelPreview } from './reel-preview'

interface StoryboardEditorProps {
  contentId: string
  initial: Storyboard | null
  hasCopy: boolean
  editable: boolean
  businessName: string
  pictures: Picture[]
  aiAvailable: boolean
  /** Signed URL of the saved voiceover; plays with the preview. */
  voiceoverUrl?: string | null
  stock?: StockOptions
}

const newScene = (): StoryboardScene => ({
  id: crypto.randomUUID(),
  scene_type: 'IMAGE',
  duration_seconds: 3,
  on_screen_text: '',
  voiceover_text: '',
  visual_prompt: '',
  transition: 'fade',
  asset_id: null,
})

/**
 * Reel storyboard: generate scenes from the saved reel script, edit texts and durations,
 * reorder, assign pictures, preview, save. Nothing is saved or generated automatically.
 */
export function StoryboardEditor({ contentId, initial, hasCopy, editable, businessName, pictures: initialPictures, aiAvailable, voiceoverUrl, stock }: StoryboardEditorProps) {
  const { t } = useI18n()
  const toast = useToast()
  const busyRef = useRef(false)
  const [storyboard, setStoryboard] = useState<Storyboard | null>(initial)
  const [pictures, setPictures] = useState(initialPictures)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [confirmRebuild, setConfirmRebuild] = useState(false)

  const urls = Object.fromEntries(pictures.filter((p) => p.url).map((p) => [p.id, p.url!]))
  const scenes = storyboard?.scenes ?? []
  const total = sumDurations(scenes)
  const totalOk = total >= REEL_DURATION.min && total <= REEL_DURATION.max

  async function run(kind: 'generate' | 'save', task: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind)
    setError(null)
    try {
      await task()
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const onGenerate = () =>
    run('generate', async () => {
      setConfirmRebuild(false)
      const result = await generateStoryboard(contentId)
      if (!result.ok || !result.data) {
        setError(result.ok ? 'errors.saveFailed' : result.error)
        return
      }
      setStoryboard(result.data.storyboard)
      setDirty(true)
    })

  const onSave = () =>
    run('save', async () => {
      if (!storyboard) return
      const result = await saveStoryboard({ content_id: contentId, storyboard: { ...storyboard, total_duration: total } })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDirty(false)
      toast.success(t('reel.saved'))
    })

  function updateScenes(update: (scenes: StoryboardScene[]) => StoryboardScene[]) {
    setStoryboard((prev) => (prev ? { ...prev, scenes: update(prev.scenes) } : prev))
    setDirty(true)
  }
  const updateScene = (id: string, patch: Partial<StoryboardScene>) => updateScenes((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (index: number, by: -1 | 1) =>
    updateScenes((list) => {
      const next = [...list]
      const [scene] = next.splice(index, 1)
      next.splice(index + by, 0, scene)
      return next
    })

  if (!storyboard) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <Clapperboard aria-hidden className="size-8 text-primary" />
        <CardTitle className="text-base">{t('reel.emptyTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{hasCopy ? t('reel.emptyHint') : t('reel.noCopyHint')}</p>
        <ActionError messageKey={error} />
        {hasCopy && editable ? (
          <Button type="button" onClick={onGenerate} loading={busy === 'generate'}>
            {busy === 'generate' ? t('reel.generating') : t('reel.generate')}
          </Button>
        ) : (
          editable && (
            <Link href={`/dashboard/content/${contentId}/edit`} className={buttonVariants({ variant: 'secondary' })}>
              {t('reel.writeScript')}
            </Link>
          )
        )}
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="lg:order-2">
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <Card className="p-3">
            <CardTitle className="mb-3 text-base">{t('reel.preview')}</CardTitle>
            <ReelPreview scenes={scenes} urls={urls} businessName={businessName} audioUrl={voiceoverUrl} />
          </Card>
          <Card className="p-3 text-sm">
            <p className={cn('font-medium', !totalOk && 'text-destructive')}>
              {t('reel.summary', { scenes: scenes.length, seconds: total })}
            </p>
            <p className="mt-1 text-muted-foreground">{t('reel.limits', { min: REEL_DURATION.min, max: REEL_DURATION.max, minScenes: REEL_SCENES.min, maxScenes: REEL_SCENES.max })}</p>
            <p className="mt-2 rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">{t('reel.videoComingSoon')}</p>
          </Card>
          {editable && (
            <>
              <ActionError messageKey={error} />
              <Button type="button" size="lg" fullWidth onClick={onSave} loading={busy === 'save'} disabled={!totalOk || busy !== null}>
                <Save aria-hidden className="size-4" />
                {busy === 'save' ? t('common.saving') : t('reel.save')}
              </Button>
              {dirty && <p className="text-center text-xs text-muted-foreground">{t('ai.unsavedNote')}</p>}
              <Button type="button" variant="ghost" size="sm" onClick={() => (dirty || initial ? setConfirmRebuild(true) : onGenerate())} disabled={!hasCopy || busy !== null}>
                <RefreshCw aria-hidden className="size-4" />
                {t('reel.rebuild')}
              </Button>
            </>
          )}
        </div>
      </div>

      <ol className="flex min-w-0 flex-col gap-3 lg:order-1" aria-label={t('reel.scenes')}>
        {scenes.map((scene, index) => (
          <li key={scene.id}>
            <Card className="flex flex-col gap-3" aria-label={t('reel.sceneLabel', { n: index + 1 })}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{t('reel.sceneLabel', { n: index + 1 })}</h3>
                {editable && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={t('reel.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp aria-hidden className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('reel.moveDown')} disabled={index === scenes.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown aria-hidden className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('reel.removeScene')}
                      disabled={scenes.length <= REEL_SCENES.min}
                      onClick={() => updateScenes((list) => list.filter((s) => s.id !== scene.id))}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                )}
              </div>

              <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('reel.field.type')}>
                  <Select value={scene.scene_type} onChange={(e) => updateScene(scene.id, { scene_type: e.target.value as StoryboardScene['scene_type'] })}>
                    {SCENE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`reel.sceneType.${type}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div>
                  <span className="mb-1.5 block text-sm font-medium" id={`dur-${scene.id}`}>
                    {t('reel.field.duration')}
                  </span>
                  <div className="flex items-center gap-2" role="group" aria-labelledby={`dur-${scene.id}`}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={t('reel.shorter')}
                      disabled={scene.duration_seconds <= SCENE_DURATION.min}
                      onClick={() => updateScene(scene.id, { duration_seconds: scene.duration_seconds - 1 })}
                    >
                      <Minus aria-hidden className="size-4" />
                    </Button>
                    <span className="min-w-12 text-center font-semibold" aria-live="polite">
                      {t('reel.seconds', { n: scene.duration_seconds })}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={t('reel.longer')}
                      disabled={scene.duration_seconds >= SCENE_DURATION.max}
                      onClick={() => updateScene(scene.id, { duration_seconds: scene.duration_seconds + 1 })}
                    >
                      <Plus aria-hidden className="size-4" />
                    </Button>
                  </div>
                </div>
                <FormField label={t('reel.field.onScreen')} className="sm:col-span-2">
                  <Textarea rows={2} maxLength={120} value={scene.on_screen_text} onChange={(e) => updateScene(scene.id, { on_screen_text: e.target.value })} />
                </FormField>
                <FormField label={t('reel.field.voiceover')} optional className="sm:col-span-2">
                  <Textarea rows={2} maxLength={300} value={scene.voiceover_text} onChange={(e) => updateScene(scene.id, { voiceover_text: e.target.value })} />
                </FormField>
                <FormField label={t('reel.field.visual')} optional hint={t('reel.field.visualHint')}>
                  <Input maxLength={200} value={scene.visual_prompt} onChange={(e) => updateScene(scene.id, { visual_prompt: e.target.value })} />
                </FormField>
                <FormField label={t('reel.field.transition')}>
                  <Select value={scene.transition} onChange={(e) => updateScene(scene.id, { transition: e.target.value as StoryboardScene['transition'] })}>
                    {SCENE_TRANSITIONS.map((tr) => (
                      <option key={tr} value={tr}>
                        {t(`reel.transition.${tr}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </fieldset>

              <details className="rounded-xl border p-3" open={Boolean(scene.asset_id)}>
                <summary className="min-h-8 cursor-pointer text-sm font-medium">
                  {scene.asset_id ? t('reel.pictureAssigned') : t('reel.assignPicture')}
                </summary>
                <div className="mt-3">
                  {editable ? (
                    <PicturePicker
                      contentId={contentId}
                      pictures={pictures}
                      selectedId={scene.asset_id}
                      onSelect={(p) => updateScene(scene.id, { asset_id: p?.id ?? null })}
                      onAdded={(p) => setPictures((prev) => [p, ...prev])}
                      aiAvailable={aiAvailable}
                      generate={{ purpose: 'scene', aspect_ratio: REEL_ASPECT_RATIO, visual: scene.visual_prompt || scene.on_screen_text }}
                      disabled={busy !== null}
                      stock={stock}
                    />
                  ) : null}
                </div>
              </details>
            </Card>
          </li>
        ))}
        {editable && (
          <li>
            <Button type="button" variant="secondary" fullWidth disabled={scenes.length >= REEL_SCENES.max} onClick={() => updateScenes((list) => [...list, newScene()])}>
              <Plus aria-hidden className="size-4" />
              {t('reel.addScene')}
            </Button>
          </li>
        )}
      </ol>

      <Dialog
        open={confirmRebuild}
        onClose={() => setConfirmRebuild(false)}
        title={t('reel.rebuildTitle')}
        description={t('reel.rebuildWarning')}
        closeLabel={t('common.close')}
      >
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setConfirmRebuild(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onGenerate} loading={busy === 'generate'}>
            {t('reel.rebuild')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
