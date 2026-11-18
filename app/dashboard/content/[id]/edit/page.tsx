import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import type { ContentStatus } from '@/lib/config/content'
import { isEditable } from '@/lib/content/status'
import { getContentItem, getTemplates } from '@/lib/data/content'
import { getTranslator } from '@/lib/i18n'
import type { ContentFormInput } from '@/lib/validation/content'
import { EditContentForm } from './edit-content-form'

export const metadata: Metadata = { title: 'Edit content' }

export default async function EditContentPage({ params }: PageProps<'/dashboard/content/[id]/edit'>) {
  const { id } = await params
  const [{ business, profile }, item, templates] = await Promise.all([requireOnboardedBusiness(), getContentItem(id), getTemplates()])
  if (!item) notFound()
  // Archived content is read-only.
  if (!isEditable(item.status as ContentStatus)) redirect(`/dashboard/content/${item.id}`)

  const t = getTranslator(profile?.preferred_language)
  const s = (v: string | null) => v ?? ''
  const initialValues: ContentFormInput = {
    content_type: item.content_type as ContentFormInput['content_type'],
    title: item.title,
    product_name: s(item.product_name),
    offer_text: s(item.offer_text),
    price: s(item.price),
    description: s(item.description),
    call_to_action: s(item.call_to_action),
    notes: s(item.notes),
    language: item.language as ContentFormInput['language'],
    template_id: s(item.template_id),
  }

  return (
    <>
      <PageHeader title={t('content.editTitle')} description={item.title} />
      <EditContentForm id={item.id} initialValues={initialValues} templates={templates} category={business.business_category} />
    </>
  )
}
