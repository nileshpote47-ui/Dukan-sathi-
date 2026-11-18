import type { Metadata } from 'next'
import { BusinessForm } from '@/components/business/business-form'
import { toFormValues } from '@/lib/validation/business-values'
import { PageHeader } from '@/components/layout/page-header'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getTranslator } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Edit business' }

export default async function EditBusinessPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  return (
    <>
      <PageHeader title={t('business.edit')} description={t('business.subtitle')} />
      <BusinessForm initialValues={toFormValues(business, profile)} />
    </>
  )
}
