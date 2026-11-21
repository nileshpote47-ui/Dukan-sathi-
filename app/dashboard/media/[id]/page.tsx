import { ArrowLeft, Download, ImageIcon, RefreshCw } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConfirmDirectPoster } from '@/components/media/confirm-direct-poster'
import { DeleteMediaButton } from '@/components/media/delete-media-button'
import { needsReview } from '@/lib/services/publishing'
import { MediaStatusBadge, MediaTypeBadge } from '@/components/media/media-badges'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getMediaAsset } from '@/lib/data/media'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { posterFromMetadata } from '@/lib/media/poster-defaults'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'

export const metadata: Metadata = { title: 'Media' }

const formatSize = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`)

export default async function MediaDetailPage({ params }: PageProps<'/dashboard/media/[id]'>) {
  const { id } = await params
  const [{ profile }, asset] = await Promise.all([requireOnboardedBusiness(), getMediaAsset(id)])
  // Not found and "someone else's" look the same.
  if (!asset) notFound()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const poster = asset.asset_type === 'POSTER' ? posterFromMetadata(asset.metadata) : null
  const providerName = asset.provider === 'gemini' ? 'Google Gemini' : asset.provider === 'openai' ? 'OpenAI' : asset.provider
  const reviewPending = needsReview(asset.metadata)

  const rows: [string, string][] = [
    [t('media.detail.type'), t(`media.type.${asset.asset_type}` as MessageKey)],
    [t('media.detail.source'), t(`media.source.${asset.source_type}` as MessageKey)],
    ...(poster ? ([[t('media.detail.ratio'), poster.aspectRatio]] as [string, string][]) : []),
    ...(asset.width && asset.height ? ([[t('media.detail.size'), `${asset.width} × ${asset.height} px`]] as [string, string][]) : []),
    ...(asset.file_size ? ([[t('media.detail.fileSize'), formatSize(asset.file_size)]] as [string, string][]) : []),
    ...(asset.source_type === 'AI_GENERATED' && providerName ? ([[t('media.detail.provider'), providerName]] as [string, string][]) : []),
    [t('content.created'), formatDateTime(asset.created_at, locale)],
  ]

  return (
    <>
      <Link
        href="/dashboard/media"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('media.backToList')}
      </Link>

      {reviewPending && <ConfirmDirectPoster id={asset.id} />}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MediaTypeBadge type={asset.asset_type} source={asset.source_type} t={t} />
            <MediaStatusBadge status={asset.displayStatus} t={t} />
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight break-words sm:text-3xl">
            {asset.content?.title ?? t(`media.type.${asset.asset_type}` as MessageKey)}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {asset.downloadUrl && (
            <a href={asset.downloadUrl} className={buttonVariants()} download>
              <Download aria-hidden className="size-4" />
              {t('media.download')}
            </a>
          )}
          {poster && asset.content && (
            <Link href={`/dashboard/content/${asset.content.id}/poster?from=${asset.id}`} className={buttonVariants({ variant: 'secondary' })}>
              <RefreshCw aria-hidden className="size-4" />
              {t('media.newVersion')}
            </Link>
          )}
          <DeleteMediaButton id={asset.id} redirectTo="/dashboard/media" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex items-center justify-center p-3">
          {asset.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable
            <img
              src={asset.url}
              alt={t('media.previewAlt')}
              width={asset.width ?? undefined}
              height={asset.height ?? undefined}
              className="h-auto max-h-[75dvh] w-auto max-w-full rounded-xl object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <ImageIcon aria-hidden className="size-10" />
              <p>{asset.displayStatus === 'FAILED' ? t('media.failedHint') : t('media.generatingHint')}</p>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle className="mb-3 text-base">{t('media.detail.title')}</CardTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium break-words">{value}</dd>
                </div>
              ))}
              <dt className="text-muted-foreground">{t('media.detail.content')}</dt>
              <dd className="font-medium break-words">
                {asset.content ? (
                  <Link href={`/dashboard/content/${asset.content.id}`} className="text-primary underline-offset-4 hover:underline">
                    {asset.content.title}
                  </Link>
                ) : (
                  t('media.noContent')
                )}
              </dd>
            </dl>
          </Card>
          <p className="text-sm text-muted-foreground">{t('media.shareHint')}</p>
        </div>
      </div>
    </>
  )
}
