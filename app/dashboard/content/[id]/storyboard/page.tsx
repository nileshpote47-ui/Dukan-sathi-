import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { StoryboardEditor } from '@/components/media/storyboard-editor'
import { VoiceoverPanel } from '@/components/media/voiceover-panel'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import type { ContentStatus } from '@/lib/config/content'
import { isEditable } from '@/lib/content/status'
import { getContentItem } from '@/lib/data/content'
import { getAssetUrls, listPictures } from '@/lib/data/media'
import { getBillingOverview } from '@/lib/data/billing'
import { getVoiceoverView } from '@/lib/data/voiceover'
import { voiceoverText } from '@/lib/media/voiceover-text'
import { stockOptions } from '@/lib/media/stock-options'
import { isVoiceConfigured } from '@/services/voice/provider'
import { getTranslator } from '@/lib/i18n'
import { hasReelCopy } from '@/lib/media/storyboard'
import { storyboardSchema } from '@/lib/validation/media'
import { generatedCopySchema } from '@/services/ai/output'
import { isImageGenerationConfigured } from '@/services/media/provider'

export const metadata: Metadata = { title: 'Reel storyboard' }
export const maxDuration = 60

export default async function StoryboardPage({ params }: PageProps<'/dashboard/content/[id]/storyboard'>) {
  const { id } = await params
  const [{ business, profile }, item, pictures, billing] = await Promise.all([requireOnboardedBusiness(), getContentItem(id), listPictures(), getBillingOverview()])
  if (!item) notFound()
  if (item.content_type !== 'REEL') redirect(`/dashboard/content/${item.id}`)
  const t = getTranslator(profile?.preferred_language)

  const copy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  const saved = item.storyboard ? storyboardSchema.safeParse(item.storyboard) : null
  const storyboard = saved?.success ? saved.data : null

  const voiceover = await getVoiceoverView(item.voiceover, item.id)
  const voiceUsage = billing.usage.find((row) => row.feature_key === 'voiceover')

  // Pictures for the pickers, plus any assigned picture that is older than the picker list.
  const options = pictures.map((p) => ({ id: p.id, url: p.url, ai: p.source_type === 'AI_GENERATED' }))
  const missing = (storyboard?.scenes ?? []).map((s) => s.asset_id).filter((a): a is string => Boolean(a) && !options.some((p) => p.id === a))
  const extra = await getAssetUrls(missing)
  for (const [assetId, url] of Object.entries(extra)) options.push({ id: assetId, url, ai: false })
  // A picture deleted since saving is simply unassigned.
  const known = new Set(options.map((p) => p.id))
  const cleaned = storyboard && {
    ...storyboard,
    scenes: storyboard.scenes.map((s) => (s.asset_id && !known.has(s.asset_id) ? { ...s, asset_id: null } : s)),
  }

  return (
    <>
      <Link
        href={`/dashboard/content/${item.id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('poster.backToContent')}
      </Link>
      <PageHeader title={t('reel.title')} description={t('reel.description', { title: item.title })} />
      <StoryboardEditor
        contentId={item.id}
        initial={cleaned}
        hasCopy={copy.success && hasReelCopy(copy.data)}
        editable={isEditable(item.status as ContentStatus)}
        businessName={business.business_name}
        pictures={options}
        aiAvailable={isImageGenerationConfigured()}
        voiceoverUrl={voiceover?.url ?? null}
        stock={stockOptions(business.business_category, t)}
      />
      <div className="mt-4">
        <VoiceoverPanel
          contentId={item.id}
          available={isVoiceConfigured()}
          remaining={voiceUsage ? voiceUsage.remaining : null}
          hasLines={Boolean(storyboard && voiceoverText(storyboard))}
          editable={isEditable(item.status as ContentStatus)}
          current={voiceover}
        />
      </div>
    </>
  )
}
