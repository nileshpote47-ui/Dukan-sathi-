import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { PosterEditor, type PosterTemplateOption } from '@/components/media/poster-editor'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { BASIC_LAYOUT_SLUG, isPosterLayoutSlug } from '@/lib/config/poster-templates'
import { getContentItem, getTemplates } from '@/lib/data/content'
import { getMediaAsset, listPictures } from '@/lib/data/media'
import { getTranslator } from '@/lib/i18n'
import { posterDefaults, posterFromMetadata } from '@/lib/media/poster-defaults'
import { generatedCopySchema, hasGeneratedCopy } from '@/services/ai/output'
import { isImageGenerationConfigured } from '@/services/media/provider'

export const metadata: Metadata = { title: 'Create poster' }
// An AI picture can take a while; generation has its own shorter timeout.
export const maxDuration = 60

export default async function PosterPage({ params, searchParams }: PageProps<'/dashboard/content/[id]/poster'>) {
  const { id } = await params
  const { from } = await searchParams
  const [{ business, profile }, item, templates, pictures] = await Promise.all([
    requireOnboardedBusiness(),
    getContentItem(id),
    getTemplates(),
    listPictures(),
  ])
  if (!item) notFound()
  const t = getTranslator(profile?.preferred_language)

  const parsedCopy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  const copy = parsedCopy.success && hasGeneratedCopy(parsedCopy.data) ? parsedCopy.data : null
  const defaults = posterDefaults(item, copy, business)

  // "Make another version" of a saved poster of this content: start from its settings.
  const source = typeof from === 'string' ? await getMediaAsset(from) : null
  const previous = source && source.content_item_id === item.id ? posterFromMetadata(source.metadata) : null
  const pictureOptions = pictures.map((p) => ({ id: p.id, url: p.url, ai: p.source_type === 'AI_GENERATED' }))

  const options: PosterTemplateOption[] = [
    { slug: BASIC_LAYOUT_SLUG, name: t('poster.basicTemplate'), description: '' },
    ...templates.filter((tpl) => isPosterLayoutSlug(tpl.slug)).map((tpl) => ({ slug: tpl.slug, name: tpl.name, description: tpl.description })),
  ]

  return (
    <>
      <Link
        href={`/dashboard/content/${item.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('poster.backToContent')}
      </Link>
      <PageHeader title={t('poster.title')} description={t('poster.description', { title: item.title })} />
      <PosterEditor
        contentId={item.id}
        templates={options}
        initial={previous ?? { ...defaults, imageId: null }}
        pictures={pictureOptions}
        aiAvailable={isImageGenerationConfigured()}
      />
    </>
  )
}
