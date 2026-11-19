import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { PublishForm, type PublishAccountOption } from '@/components/publishing/publish-form'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { PUBLISHABLE_STATUSES, type ContentStatus } from '@/lib/config/content'
import { CHANNELS, isChannel, type Channel } from '@/lib/config/publishing'
import { getBillingOverview } from '@/lib/data/billing'
import { getContentItem } from '@/lib/data/content'
import { listMediaForContent } from '@/lib/data/media'
import { listJobsForContent, listSocialAccounts, listWhatsAppContacts } from '@/lib/data/publishing'
import { getTranslator } from '@/lib/i18n'
import { defaultCaption, isSchedulableDate } from '@/lib/publishing/compose'
import { isoToIstInput } from '@/lib/utils/datetime'
import { generatedCopySchema, hasGeneratedCopy } from '@/services/ai/output'

export const metadata: Metadata = { title: 'Publish' }

export default async function PublishPage({ params }: PageProps<'/dashboard/content/[id]/publish'>) {
  const { id } = await params
  const [{ business, profile }, item] = await Promise.all([requireOnboardedBusiness(), getContentItem(id)])
  if (!item) notFound()
  const t = getTranslator(profile?.preferred_language)

  const back = (
    <Link href={`/dashboard/content/${item.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" />
      {item.title}
    </Link>
  )

  if (!PUBLISHABLE_STATUSES.includes(item.status as ContentStatus)) {
    return (
      <>
        {back}
        <PageHeader title={t('publishing.form.title', { title: item.title })} />
        <Card>
          <p className="mb-4">{t('publishing.error.contentNotReady')}</p>
          <Link href={`/dashboard/content/${item.id}`} className={buttonVariants({})}>
            {t('common.back')}
          </Link>
        </Card>
      </>
    )
  }

  const parsed = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  const copy = item.generated_copy && parsed.success && hasGeneratedCopy(parsed.data) ? parsed.data : null
  const [accounts, media, contacts, jobs, billing] = await Promise.all([
    listSocialAccounts(),
    listMediaForContent(item.id),
    listWhatsAppContacts(),
    listJobsForContent(item.id),
    getBillingOverview(),
  ])

  const captions = Object.fromEntries(CHANNELS.map((c) => [c, defaultCaption(c, item, copy)])) as Record<Channel, string>
  const options: PublishAccountOption[] = accounts
    .filter((a) => a.status === 'CONNECTED' && isChannel(a.channel))
    .map((a) => ({ id: a.id, channel: a.channel as Channel, name: a.external_account_name ?? a.channel }))
  const usage = billing.usage.find((u) => u.feature_key === 'social_publishing')
  const scheduled = item.scheduled_for && isSchedulableDate(item.scheduled_for) ? isoToIstInput(item.scheduled_for) : ''

  return (
    <>
      {back}
      <PageHeader title={t('publishing.form.title', { title: item.title })} description={t('publishing.form.subtitle')} />
      <PublishForm
        contentId={item.id}
        accounts={options}
        captions={captions}
        media={media
          .filter((m) => m.url && m.width && m.height)
          .map((m) => ({ id: m.id, url: m.url!, width: m.width!, height: m.height!, mimeType: m.mime_type ?? 'image/png', type: m.asset_type }))}
        contacts={contacts.filter((c) => !c.opted_out_at).map((c) => ({ id: c.id, name: c.name ?? c.phone_e164, phone: c.phone_e164 }))}
        publishedAccountIds={[...new Set(jobs.filter((j) => j.status === 'PUBLISHED' && j.social_account_id).map((j) => j.social_account_id!))]}
        credits={usage ? { remaining: usage.remaining, limit: usage.monthly_limit } : null}
        defaultSchedule={scheduled}
        businessName={business.business_name}
        whatsappDefaults={[copy?.short_text || item.offer_text || item.product_name || item.title, business.village || business.district || business.business_name]}
      />
    </>
  )
}
