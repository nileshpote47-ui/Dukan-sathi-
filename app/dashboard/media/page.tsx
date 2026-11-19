import { ImageIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { MediaStatusBadge, MediaTypeBadge } from '@/components/media/media-badges'
import { UploadPictureButton } from '@/components/media/upload-picture-button'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { MEDIA_ASSET_TYPES, MEDIA_PAGE_SIZE, type MediaAssetType } from '@/lib/config/media'
import { listMediaAssets } from '@/lib/data/media'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDateTime, intlLocale } from '@/lib/utils/datetime'
import { parseMediaListParams, type MediaListParams } from '@/lib/validation/media'

export const metadata: Metadata = { title: 'Media' }

function listHref(params: MediaListParams, overrides: Partial<MediaListParams>) {
  const next = { ...params, ...overrides }
  const search = new URLSearchParams()
  if (next.type) search.set('type', next.type)
  if (next.page > 1) search.set('page', String(next.page))
  const query = search.toString()
  return query ? `/dashboard/media?${query}` : '/dashboard/media'
}

export default async function MediaPage({ searchParams }: PageProps<'/dashboard/media'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const params = parseMediaListParams(raw)
  const { items, total } = await listMediaAssets(params)
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const pages = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE))
  const filters: (MediaAssetType | undefined)[] = [undefined, ...MEDIA_ASSET_TYPES]

  return (
    <>
      <PageHeader title={t('media.title')} description={t('media.subtitle')} actions={<UploadPictureButton />} />

      <nav aria-label={t('media.filter')} className="mb-4 flex flex-wrap gap-2">
        {filters.map((type) => {
          const active = params.type === type
          return (
            <Link
              key={type ?? 'all'}
              href={listHref(params, { type, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cn(buttonVariants({ variant: active ? 'primary' : 'secondary', size: 'sm' }))}
            >
              {type ? t(`media.filter.${type}` as MessageKey) : t('media.filter.all')}
            </Link>
          )
        })}
      </nav>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {t('media.results', { count: total })}
      </p>

      {items.length === 0 ? (
        <EmptyState icon={ImageIcon} title={t('media.emptyTitle')} body={t('media.emptyHint')} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((asset) => (
            <li key={asset.id}>
              <Link
                href={`/dashboard/media/${asset.id}`}
                className="block overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex aspect-square items-center justify-center bg-muted">
                  {asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable
                    <img src={asset.url} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap gap-1">
                    <MediaTypeBadge type={asset.asset_type} source={asset.source_type} t={t} />
                    {asset.displayStatus !== 'READY' && <MediaStatusBadge status={asset.displayStatus} t={t} />}
                  </div>
                  <p className="truncate text-sm font-medium">{asset.content?.title ?? t('media.noContent')}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(asset.created_at, locale)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={t('media.pagination')} className="mt-6 flex items-center justify-center gap-3">
          {params.page > 1 && (
            <Link href={listHref(params, { page: params.page - 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('content.prev')}
            </Link>
          )}
          <span className="text-sm text-muted-foreground">{t('content.page', { page: params.page, pages })}</span>
          {params.page < pages && (
            <Link href={listHref(params, { page: params.page + 1 })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('content.next')}
            </Link>
          )}
        </nav>
      )}
    </>
  )
}
