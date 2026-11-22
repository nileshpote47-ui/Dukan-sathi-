'use client'

import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StoryboardScene } from '@/lib/media/storyboard'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

/**
 * Plays a storyboard in a 9:16 frame: each scene's picture (if any) with its on-screen
 * text, for its duration. A preview only — no video file is produced.
 */
export function ReelPreview({
  scenes,
  urls,
  businessName,
  audioUrl,
}: {
  scenes: StoryboardScene[]
  urls: Record<string, string>
  businessName: string
  /** The reel's voiceover (signed URL); plays along with the preview. */
  audioUrl?: string | null
}) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const total = scenes.reduce((sum, s) => sum + s.duration_seconds, 0)

  // Keep the voiceover in step with the preview: start where the preview is, stop when it stops.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.currentTime = Math.min(elapsed, Number.isFinite(audio.duration) ? audio.duration : elapsed)
      void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
    // elapsed is read once when playback (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioUrl])

  useEffect(() => {
    if (!playing) return
    const started = Date.now() - elapsed * 1000
    const timer = setInterval(() => {
      const next = (Date.now() - started) / 1000
      if (next >= total) {
        setElapsed(total)
        setPlaying(false)
      } else {
        setElapsed(next)
      }
    }, 100)
    return () => clearInterval(timer)
    // elapsed is read once when playback (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total])

  let index = 0
  let start = 0
  for (let i = 0; i < scenes.length; i++) {
    if (elapsed < start + scenes[i].duration_seconds || i === scenes.length - 1) {
      index = i
      break
    }
    start += scenes[i].duration_seconds
  }
  const scene = scenes[index]
  const url = scene?.asset_id ? urls[scene.asset_id] : undefined
  const finished = elapsed >= total && total > 0

  return (
    <div className="flex flex-col items-center gap-3">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />}
      <div
        className="relative aspect-[9/16] w-full max-w-[15rem] overflow-hidden rounded-2xl bg-gradient-to-b from-primary to-slate-900 text-white shadow"
        aria-label={t('reel.previewLabel')}
        role="img"
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL
          <img key={scene.id} src={url} alt="" className="absolute inset-0 size-full animate-[fadein_.4s_ease] object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
        <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden>
          {scenes.map((s, i) => (
            <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full bg-white"
                style={{ width: i < index ? '100%' : i > index ? '0%' : `${Math.min(100, ((elapsed - start) / s.duration_seconds) * 100)}%` }}
              />
            </span>
          ))}
        </div>
        {scene && (
          <p key={`${scene.id}-text`} className={cn('absolute inset-x-4 bottom-10 text-center text-lg leading-snug font-bold break-words drop-shadow', 'animate-[fadein_.4s_ease]')}>
            {scene.on_screen_text}
          </p>
        )}
        <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium opacity-80">{businessName}</p>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('reel.previewPosition', { n: index + 1, total: scenes.length, seconds: Math.floor(elapsed), duration: total })}
      </p>
      <div className="flex gap-2">
        {finished ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => { setElapsed(0); setPlaying(true) }}>
            <RotateCcw aria-hidden className="size-4" />
            {t('reel.replay')}
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            {playing ? t('reel.pause') : t('reel.play')}
          </Button>
        )}
      </div>
    </div>
  )
}
