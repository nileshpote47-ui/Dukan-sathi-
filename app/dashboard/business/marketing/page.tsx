import type { Metadata } from 'next'
import { MarketingPreferenceForm } from '@/components/business/marketing-preference-form'
import { PageHeader } from '@/components/layout/page-header'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getTranslator } from '@/lib/i18n'
import type { MarketingPreferencesInput } from '@/lib/validation/content'

export const metadata: Metadata = { title: 'Marketing preferences' }

export default async function MarketingPreferencesPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  const s = (v: string | null) => v ?? ''
  const initialValues = {
    content_language: s(business.content_language),
    tone: s(business.tone),
    promotional_style: s(business.promotional_style),
    preferred_contact_method: s(business.preferred_contact_method),
    target_customers: s(business.target_customers),
    preferred_cta: s(business.preferred_cta),
    description: s(business.description),
  } as MarketingPreferencesInput

  return (
    <>
      <PageHeader title={t('marketing.title')} description={t('marketing.subtitle')} />
      <MarketingPreferenceForm initialValues={initialValues} />
    </>
  )
}
