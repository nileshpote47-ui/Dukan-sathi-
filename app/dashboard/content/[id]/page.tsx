import { ArrowLeft, CalendarClock, Pencil, Sparkles } from 'lucide-react'
import { AICopyView } from '@/components/ai/ai-copy-view'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentStatusBadge, ContentTypeBadge } from '@/components/content/content-badges'
import { ContentPreview } from '@/components/content/content-preview'
import { DeleteContentButton } from '@/components/content/delete-content-button'
import { StatusActions } from '@/components/content/status-actions'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import type { ContentStatus } from '@/lib/config/content'
import { isEditable } from '@/lib/content/status'
import { getContentItem } from '@/lib/data/content'
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
          {isEditable(status) && (
            <Link href={`/dashboard/content/${item.id}/edit`} className={buttonVariants()}>
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
          {status === 'SCHEDULED' && <p className="text-sm text-muted-foreground">{t('publishing.notice')}</p>}
        </div>
      </div>
    </>
  )
}
