'use client'

import { CalendarClock, Check, Pencil, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { approveAutopilotPostAction, skipAutopilotPostAction } from '@/app/dashboard/autopilot/actions'
import { ActionError } from '@/components/billing/action-error'
import { PosterCanvas } from '@/components/media/poster-canvas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { AUTOPILOT_POSTER_RATIO } from '@/lib/config/autopilot'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import type { PosterTexts } from '@/lib/media/poster-layout'
import { cn } from '@/lib/utils/cn'

export interface WeekPost {
  id: string
  contentId: string
  status: 'PENDING' | 'SCHEDULED' | 'SKIPPED'
  when: string
  past: boolean
  title: string
  caption: string
  template: string
  texts: PosterTexts
  idea: string
}

/*
 * This week's prepared posts. Each poster is drawn here from the post's own text; "Approve" sends that poster
 * and schedules the post on the chosen accounts. Nothing is published without this tap.
 */
export function AutopilotWeek({ posts, canApprove }: { posts: WeekPost[]; canApprove: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const canvases = useRef(new Map<string, HTMLCanvasElement>())
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, MessageKey>>({})
  const pending = posts.filter((p) => p.status === 'PENDING' && !p.past)

  const approve = async (post: WeekPost): Promise<boolean> => {
    const canvas = canvases.current.get(post.id)
    const blob = canvas && (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')))
    if (!blob) {
      setErrors((e) => ({ ...e, [post.id]: 'errors.saveFailed' }))
      return false
    }
    const form = new FormData()
    form.set('id', post.id)
    form.set('file', blob, 'poster.png')
    const result = await approveAutopilotPostAction(form)
    if (!result.ok) {
      setErrors((e) => ({ ...e, [post.id]: result.error }))
      return false
    }
    return true
  }

  const run = async (ids: string[]) => {
    setBusy(ids.length > 1 ? 'all' : ids[0])
    setErrors({})
    let done = 0
    for (const id of ids) if (await approve(posts.find((p) => p.id === id)!)) done++
    setBusy(null)
    if (done) toast.success(t('autopilot.approvedN', { n: done }))
    router.refresh()
  }

  const skip = async (id: string) => {
    setBusy(id)
    const result = await skipAutopilotPostAction(id)
    setBusy(null)
    if (!result.ok) return setErrors((e) => ({ ...e, [id]: result.error }))
    router.refresh()
  }

  if (!posts.length) return <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t('autopilot.noPosts')}</p>

  return (
    <div className="flex flex-col gap-4">
      {canApprove && pending.length > 1 && (
        <Button onClick={() => void run(pending.map((p) => p.id))} loading={busy === 'all'} disabled={busy !== null} size="lg">
          <Check aria-hidden className="size-4" />
          {t('autopilot.approveAll', { n: pending.length })}
        </Button>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {posts.map((post) => (
          <li key={post.id}>
            <Card className={cn('flex flex-col gap-3', post.status !== 'PENDING' && 'opacity-80')} aria-label={post.title}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <CalendarClock aria-hidden className="size-4 text-primary" />
                  {post.when}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    post.status === 'SCHEDULED' ? 'bg-success-soft text-success' : post.status === 'SKIPPED' ? 'bg-muted text-muted-foreground' : 'bg-accent-soft text-accent-foreground',
                  )}
                >
                  {t(post.past && post.status === 'PENDING' ? 'autopilot.status.missed' : (`autopilot.status.${post.status}` as MessageKey))}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{post.idea}</p>
              <div className="mx-auto w-full max-w-[16rem]">
                <PosterCanvas
                  ref={(node) => {
                    if (node) canvases.current.set(post.id, node)
                    else canvases.current.delete(post.id)
                  }}
                  template={post.template}
                  aspectRatio={AUTOPILOT_POSTER_RATIO}
                  texts={post.texts}
                  imageUrl={null}
                  label={t('autopilot.posterLabel', { title: post.title })}
                />
              </div>
              <p className="line-clamp-4 text-sm whitespace-pre-line">{post.caption}</p>
              <ActionError messageKey={errors[post.id] ?? null} />
              {post.status === 'PENDING' && !post.past && (
                <div className="flex flex-wrap gap-2">
                  {canApprove && (
                    <Button size="sm" onClick={() => void run([post.id])} loading={busy === post.id} disabled={busy !== null}>
                      <Check aria-hidden className="size-4" />
                      {t('autopilot.approve')}
                    </Button>
                  )}
                  <Link href={`/dashboard/content/${post.contentId}/edit`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium hover:border-primary">
                    <Pencil aria-hidden className="size-4" />
                    {t('autopilot.edit')}
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => void skip(post.id)} disabled={busy !== null}>
                    <X aria-hidden className="size-4" />
                    {t('autopilot.skip')}
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
