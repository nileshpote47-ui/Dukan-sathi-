import { ExternalLink, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { LANGUAGES } from '@/lib/config/languages'
import { getTranslator, type MessageKey } from '@/lib/i18n'

export const metadata: Metadata = { title: 'My Business' }

export default async function BusinessPage() {
  const { business: b, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  const none = t('common.notAdded')
  const language = LANGUAGES.find((l) => l.code === profile?.preferred_language)

  const sections: { title: MessageKey; rows: [MessageKey, string | null, 'link'?][] }[] = [
    {
      title: 'business.section.basic',
      rows: [
        ['field.businessName', b.business_name],
        ['field.category', t(`category.${b.business_category}` as MessageKey)],
        ['field.description', b.description],
      ],
    },
    {
      title: 'business.section.contact',
      rows: [
        ['field.ownerName', profile?.full_name ?? null],
        ['field.phone', b.phone],
        ['field.whatsapp', b.whatsapp_number],
        ['field.email', b.email],
      ],
    },
    {
      title: 'business.section.location',
      rows: [
        ['field.addressLine', b.address_line],
        ['field.village', b.village],
        ['field.taluka', b.taluka],
        ['field.district', b.district],
        ['field.state', b.state],
        ['field.pincode', b.pincode],
        ['field.country', b.country],
      ],
    },
    {
      title: 'business.section.brand',
      rows: [
        ['field.tagline', b.brand_tagline],
        ['field.openingHours', b.opening_hours],
        ['field.instagram', b.instagram_url, 'link'],
        ['field.facebook', b.facebook_url, 'link'],
        ['field.googleBusiness', b.google_business_url, 'link'],
        ['field.website', b.website_url, 'link'],
      ],
    },
    { title: 'business.section.preferences', rows: [['field.language', language?.nativeLabel ?? null]] },
  ]

  const contentLanguage = LANGUAGES.find((l) => l.code === b.content_language)
  const marketingRows: [MessageKey, string | null][] = [
    ['marketing.contentLanguage', contentLanguage?.nativeLabel ?? null],
    ['marketing.tone', b.tone ? t(`tone.${b.tone}` as MessageKey) : null],
    ['marketing.targetCustomers', b.target_customers],
    ['marketing.preferredCta', b.preferred_cta],
    ['marketing.promotionalStyle', b.promotional_style ? t(`promotionalStyle.${b.promotional_style}` as MessageKey) : null],
    ['marketing.contactMethod', b.preferred_contact_method ? t(`contactMethod.${b.preferred_contact_method}` as MessageKey) : null],
  ]

  return (
    <>
      <PageHeader
        title={t('business.title')}
        description={t('business.subtitle')}
        actions={
          <Link href="/dashboard/business/edit" className={buttonVariants()}>
            <Pencil aria-hidden className="size-4" />
            {t('business.edit')}
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardTitle>{t(section.title)}</CardTitle>
            <dl className="mt-4 grid gap-3">
              {section.rows.map(([label, value, kind]) => (
                <div key={label} className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
                  <dt className="text-sm text-muted-foreground">{t(label)}</dt>
                  <dd className="min-w-0 break-words">
                    {!value ? (
                      <span className="text-muted-foreground">{none}</span>
                    ) : kind === 'link' ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        {value.replace(/^https?:\/\//, '')}
                        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t('marketing.title')}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t('marketing.subtitle')}</p>
            </div>
            <Link href="/dashboard/business/marketing" className={buttonVariants({ variant: 'secondary', className: 'shrink-0' })}>
              <Pencil aria-hidden className="size-4" />
              {t('marketing.edit')}
            </Link>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {marketingRows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{t(label)}</dt>
                <dd className={value ? 'break-words' : 'text-muted-foreground'}>{value ?? t('marketing.notSet')}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  )
}
