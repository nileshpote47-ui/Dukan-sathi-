'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateContent } from '@/app/dashboard/content/actions'
import { ContentForm } from '@/components/content/content-form'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import type { ContentTemplate } from '@/lib/data/content'
import { useI18n } from '@/lib/i18n/provider'
import type { ContentFormInput } from '@/lib/validation/content'

export function EditContentForm({
  id,
  initialValues,
  templates,
  category,
}: {
  id: string
  initialValues: ContentFormInput
  templates: ContentTemplate[]
  category: string
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  return (
    <Card>
      <ContentForm
        initialValues={initialValues}
        templates={templates}
        category={category}
        showTypeSelect
        submitLabel={t('common.save')}
        secondaryAction={
          <Link href={`/dashboard/content/${id}`} className={buttonVariants({ variant: 'secondary' })}>
            {t('common.cancel')}
          </Link>
        }
        onSubmit={async (values) => {
          const result = await updateContent(id, values)
          if (result.ok) {
            toast.success(t('content.saved'))
            router.push(`/dashboard/content/${id}`)
            router.refresh()
          }
          return result
        }}
      />
    </Card>
  )
}
