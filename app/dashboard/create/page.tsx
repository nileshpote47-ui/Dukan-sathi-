import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { isContentType } from '@/lib/config/content'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/config/languages'
import { getTemplates } from '@/lib/data/content'
import { getTranslator } from '@/lib/i18n'
import { CreateFlow } from './create-flow'

export const metadata: Metadata = { title: 'Create' }

export default async function CreatePage({ searchParams }: PageProps<'/dashboard/create'>) {
  const [{ business, profile }, templates, params] = await Promise.all([requireOnboardedBusiness(), getTemplates(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type
  const initialType = isContentType(rawType) ? rawType : null

  // Content language: business marketing preference → owner's app language → English.
  const language = [business.content_language, profile?.preferred_language].find(
    (code): code is LanguageCode => Boolean(code && isLanguageCode(code)),
  )

  return (
    <>
      <PageHeader title={t('create.title')} description={t('create.subtitle')} />
      <CreateFlow
        initialType={initialType}
        templates={templates}
        category={business.business_category}
        defaults={{ language: language ?? DEFAULT_LANGUAGE, callToAction: business.preferred_cta ?? '' }}
      />
    </>
  )
}
