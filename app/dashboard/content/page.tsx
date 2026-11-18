import { LayoutGrid, List, Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentCard } from '@/components/content/content-card'
import { ContentEmptyState } from '@/components/content/content-empty-state'
import { ContentFilters } from '@/components/content/content-filters'
import { DeleteContentButton } from '@/components/content/delete-content-button'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { CONTENT_PAGE_SIZE } from '@/lib/config/content'
import { isEditable } from '@/lib/content/status'
import { listContentItems } from '@/lib/data/content'
import { getTranslator } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { intlLocale } from '@/lib/utils/datetime'
import { parseContentListParams, type ContentListParams } from '@/lib/validation/content'
import type { ContentStatus } from '@/lib/config/content'

export const metadata: Metadata = { title: 'Content' }

function listHref(params: ContentListParams, overrides: Partial<ContentListParams>) {
  const next = { ...params, ...overrides }
  const search = new URLSearchParams()
  if (next.q) search.set('q', next.q)
  if (next.type) search.set('type', next.type)
  if (next.status) search.set('status', next.status)
  if (next.view === 'grid') search.set('view', 'grid')
  if (next.page > 1) search.set('page', String(next.page))
  const query = search.toString()
  return query ? `/dashboard/content?${query}` : '/dashboard/content'
}

export default async function ContentListPage({ searchParams }: PageProps<'/dashboard/content'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const params = parseContentListParams(raw)
  const { items, total } = await listContentItems(params)
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const pages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE))
  const filtered = Boolean(params.q || params.type || params.status)

  return (
    <>
      <PageHeader
        title={t('content.title')}
        description={t('content.subtitle')}
        actions={
          <Link href="/dashboard/create" className={buttonVariants()}>
            <Plus aria-hidden className="size-4" />
            {t('content.new')}
          </Link>
        }
      />

      <ContentFilters q={params.q} type={params.type} status={params.status} view={params.view} />

      <div className="mt-4 mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('content.results', { count: total })}
        </p>
        <div className="flex gap-1" role="group" aria-label={`${t('content.viewList')} / ${t('content.viewGrid')}`}>
          {(['list', 'grid'] as const).map((view) => {
            const Icon = view === 'list' ? List : LayoutGrid
            const active = params.view === view
            return (
              <Link
                key={view}
                href={listHref(params, { view, page: 1 })}
                aria-label={t(view === 'list' ? 'content.viewList' : 'content.viewGrid')}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-xl border focus-visible:outline-2 focus-visible:outline-ring',
                  active ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground',
                )}
              >
                <Icon aria-hidden className="size-5" />
              </Link>
            )
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <ContentEmptyState t={t} filtered={filtered} />
        </div>
      ) : (
        <ul className={cn('grid gap-3', params.view === 'grid' && 'sm:grid-cols-2 lg:grid-cols-3')}>
          {items.map((item) => (
            <li key={item.id}>
              <ContentCard
                item={item}
                t={t}
                locale={locale}
                layout={params.view}
                actions={
                  <>
                    {isEditable(item.status as ContentStatus) && (
                      <Link
                        href={`/dashboard/content/${item.id}/edit`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        aria-label={`${t('content.edit')}: ${item.title}`}
                      >
                        <Pencil aria-hidden className="size-4" />
                        {t('content.edit')}
                      </Link>
                    )}
                    {item.status === 'DRAFT' && <DeleteContentButton id={item.id} title={item.title} size="sm" />}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={t('content.page', { page: params.page, pages })} className="mt-6 flex items-center justify-between gap-3">
          {params.page > 1 ? (
            <Link href={listHref(params, { page: params.page - 1 })} className={buttonVariants({ variant: 'secondary' })}>
              {t('content.prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{t('content.page', { page: params.page, pages })}</span>
          {params.page < pages ? (
            <Link href={listHref(params, { page: params.page + 1 })} className={buttonVariants({ variant: 'secondary' })}>
              {t('content.next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  )
}
