import { ArrowLeft, CalendarClock, Clapperboard, ImageIcon, Pencil, Send, Sparkles } from 'lucide-react'
import { AICopyView } from '@/components/ai/ai-copy-view'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentStatusBadge, ContentTypeBadge } from '@/components/content/content-badges'
import { ContentPreview } from '@/components/content/content-preview'
import { DeleteContentButton } from '@/components/content/delete-content-button'
import { JobCard } from '@/components/publishing/job-card'
import { StatusActions } from '@/components/content/status-actions'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { PUBLISHABLE_STATUSES, type ContentStatus } from '@/lib/config/content'
import { isEditable } from '@/lib/content/status'
import { getContentItem } from '@/lib/data/content'
import { listMediaForContent } from '@/lib/data/media'
import { listJobsForContent } from '@/lib/data/publishing'
import { storyboardSchema } from '@/lib/validation/media'
import { getTranslator } from '@/lib/i18n'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'
import type { ContentType } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { generatedCopySchema, hasGeneratedCopy } from '@/services/ai/output'

export const metadata: Metadata = { title: 'Content' }

export default async function ContentDetailPage({ params }: PageProps<'/dashboard/content/[id]'>) {
  const { id } = await params
  const [{ business, profile }, item] = await Promise.all([requireOnboardedBusiness(), getContentItem(id)])
  // Not found and "belongs to someone else" look the same: no information leaks.
  if (!item) notFound()
  const [media, jobs] = await Promise.all([listMediaForContent(item.id), listJobsForContent(item.id, 5)])
  const storyboard = item.storyboard ? storyboardSchema.safeParse(item.storyboard) : null

  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const status = item.status as ContentStatus
  const parsedCopy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  const copy = item.generated_copy && parsedCopy.success && hasGeneratedCopy(parsedCopy.data) ? parsedCopy.data : null
  const providerName = item.ai_provider === 'gemini' ? 'Google Gemini' : item.ai_provider

  return (
    <>
      <Link
        href="/dashboard/content"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('content.backToList')}
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ContentTypeBadge type={item.content_type} t={t} />
            <ContentStatusBadge status={status} t={t} />
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight break-words sm:text-3xl">{item.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {PUBLISHABLE_STATUSES.includes(status) && (
            <Link href={`/dashboard/content/${item.id}/publish`} className={buttonVariants()}>
              <Send aria-hidden className="size-4" />
              {t('publishing.publishButton')}
            </Link>
          )}
          {isEditable(status) && (
            <Link href={`/dashboard/content/${item.id}/edit`} className={buttonVariants({ variant: PUBLISHABLE_STATUSES.includes(status) ? 'secondary' : 'primary' })}>
              <Pencil aria-hidden className="size-4" />
              {t('content.edit')}
            </Link>
          )}
          <DeleteContentButton id={item.id} title={item.title} redirectTo="/dashboard/content" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardTitle className="mb-4 flex items-center gap-2 text-base">
            <Sparkles aria-hidden className="size-4 text-primary" />
            {t('ai.resultTitle')}
          </CardTitle>
          {copy ? (
            <AICopyView
              type={item.content_type as ContentType}
              copy={copy}
              t={t}
              generatedLabel={
                item.ai_generated_at && providerName
                  ? t('ai.generatedWith', { provider: providerName, date: formatDateTime(item.ai_generated_at, locale) })
                  : undefined
              }
            />
          ) : (
            <div className="text-sm">
              <p className="font-medium">{t('ai.noContentYet')}</p>
              {isEditable(status) && <p className="mt-1 text-muted-foreground">{t('ai.noContentHint')}</p>}
            </div>
          )}
        </Card>
        <Card>
          <ContentPreview
            values={item}
            templateName={item.template?.name}
            t={t}
            extraRows={[
              [t('contentField.tone'), item.tone ? t(`tone.${item.tone}` as MessageKey) : t('contentField.toneDefault')],
              [t('content.business'), business.business_name],
              [t('content.created'), formatDateTime(item.created_at, locale)],
              [t('content.updated'), formatDateTime(item.updated_at, locale)],
            ]}
          />
        </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle className="text-base">{t('content.changeStatus')}</CardTitle>
            {item.scheduled_for && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                <CalendarClock aria-hidden className="size-4" />
                {t('content.scheduledFor')}: {formatDateTime(item.scheduled_for, locale)}
              </p>
            )}
            <div className="mt-3">
              <StatusActions id={item.id} status={status} scheduledFor={item.scheduled_for} />
            </div>
          </Card>
          <Card>
            <CardTitle className="text-base">{t('media.forContent')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t('media.forContentHint')}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Link href={`/dashboard/content/${item.id}/poster`} className={buttonVariants({ variant: 'secondary', fullWidth: true })}>
                <ImageIcon aria-hidden className="size-4" />
                {t('media.createPoster')}
              </Link>
              {item.content_type === 'REEL' && (
                <Link href={`/dashboard/content/${item.id}/storyboard`} className={buttonVariants({ variant: 'secondary', fullWidth: true })}>
                  <Clapperboard aria-hidden className="size-4" />
                  {storyboard?.success ? t('reel.open') : t('reel.create')}
                </Link>
              )}
            </div>
            {item.content_type === 'REEL' && storyboard?.success && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('reel.summary', { scenes: storyboard.data.scenes.length, seconds: storyboard.data.total_duration })}
              </p>
            )}
            {media.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2" aria-label={t('media.forContent')}>
                {media.map((asset) => (
                  <li key={asset.id}>
                    <Link href={`/dashboard/media/${asset.id}`} className="block aspect-square overflow-hidden rounded-lg border bg-muted">
                      {asset.url && (
                        // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable
                        <img src={asset.url} alt={t(asset.asset_type === 'POSTER' ? 'media.type.POSTER' : 'media.type.IMAGE')} loading="lazy" className="size-full object-cover" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {status === 'SCHEDULED' && <p className="text-sm text-muted-foreground">{t('publishing.notice')}</p>}
          <section aria-labelledby="publishing-history" className="flex flex-col gap-3">
            <h2 id="publishing-history" className="text-base font-semibold">
              {t('publishing.history')}
            </h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('publishing.historyEmpty')}</p>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} t={t} locale={locale} showContent={false} />)
            )}
          </section>
        </div>
      </div>
    </>
  )
}
