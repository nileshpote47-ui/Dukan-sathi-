'use server'

import { revalidatePath } from 'next/cache'
import { AI_ERROR_MESSAGES } from '@/lib/ai/error-messages'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { ASPECT_RATIOS } from '@/lib/config/media'
import { getPosterLayout } from '@/lib/config/poster-templates'
import { getContentItem } from '@/lib/data/content'
import { getAssetUrls } from '@/lib/data/media'
import type { MessageKey } from '@/lib/i18n'
import { validateImage, type ImageProblem } from '@/lib/media/image-file'
import { buildMarketingContext } from '@/lib/marketing/context'
import { deleteMediaAsset, failGeneration, finishGeneration, ownedPictureIds, startGeneration, storeMedia } from '@/lib/services/media'
import { imageGenerationSchema, mediaIdSchema, posterSpecSchema } from '@/lib/validation/media'
import type { ActionResult } from '@/lib/validation/result'
import { buildImagePrompt } from '@/services/media/prompts'
import { getMediaConfig } from '@/services/media/provider'
import { generateMarketingImage } from '@/services/media/service'
import { AIError } from '@/services/ai/types'
import { z } from 'zod'

/*
 * Media Server Actions. Each one re-checks the session and resolves the owner's own
 * business (never a business id from the client), validates input and file bytes on the
 * server, and only then touches storage or the database (RLS applies to both).
 */

const FILE_PROBLEMS: Record<ImageProblem, MessageKey> = {
  empty: 'media.error.notImage',
  notImage: 'media.error.notImage',
  tooLarge: 'media.error.tooLarge',
  dimensions: 'media.error.dimensions',
}

async function readFile(value: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!(value instanceof Blob)) return null
  return new Uint8Array(await value.arrayBuffer())
}

const optionalContentId = z.union([z.literal(''), z.uuid()]).optional().transform((v) => v || null)

/** Upload a photo (resized in the browser first). Optionally linked to a content item. */
export async function uploadPicture(formData: FormData): Promise<ActionResult<{ id: string; url: string | null }>> {
  await requireOnboardedBusiness()
  const contentId = optionalContentId.safeParse(formData.get('content_id') ?? undefined)
  if (!contentId.success) return { ok: false, error: 'errors.validation' }
  if (contentId.data && !(await getContentItem(contentId.data))) return { ok: false, error: 'errors.contentNotFound' }

  const bytes = await readFile(formData.get('file'))
  if (!bytes) return { ok: false, error: 'media.error.notImage' }
  const checked = validateImage(bytes)
  if (!checked.ok) return { ok: false, error: FILE_PROBLEMS[checked.problem] }

  const result = await storeMedia({ bytes, info: checked.info, assetType: 'IMAGE', sourceType: 'UPLOAD', contentItemId: contentId.data })
  if (!result.ok || !result.data) return result.ok ? { ok: false, error: 'errors.saveFailed' } : result
  const urls = await getAssetUrls([result.data.id])
  revalidatePath('/dashboard/media')
  return { ok: true, data: { id: result.data.id, url: urls[result.data.id] ?? null }, message: 'media.uploaded' }
}

/** Save a poster rendered in the browser from a template. The spec is stored for re-editing. */
export async function savePoster(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireOnboardedBusiness()
  let rawSpec: unknown
  try {
    rawSpec = JSON.parse(String(formData.get('spec') ?? ''))
  } catch {
    return { ok: false, error: 'errors.validation' }
  }
  const spec = posterSpecSchema.safeParse(rawSpec)
  if (!spec.success) return { ok: false, error: 'errors.validation' }
  const item = await getContentItem(spec.data.content_id)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }
  if (spec.data.image_asset_id && !(await ownedPictureIds([spec.data.image_asset_id])).has(spec.data.image_asset_id)) {
    return { ok: false, error: 'media.error.notFound' }
  }

  const bytes = await readFile(formData.get('file'))
  if (!bytes) return { ok: false, error: 'media.error.notImage' }
  const checked = validateImage(bytes)
  if (!checked.ok) return { ok: false, error: FILE_PROBLEMS[checked.problem] }
  // The file must be the poster size for the chosen ratio, rendered as PNG or JPEG.
  const expected = ASPECT_RATIOS[spec.data.aspect_ratio]
  if (checked.info.width !== expected.width || checked.info.height !== expected.height || checked.info.mimeType === 'image/webp') {
    return { ok: false, error: 'media.error.dimensions' }
  }

  const { content_id, ...metadata } = spec.data
  const result = await storeMedia({ bytes, info: checked.info, assetType: 'POSTER', sourceType: 'TEMPLATE_RENDERED', contentItemId: content_id, metadata })
  if (!result.ok || !result.data) return result.ok ? { ok: false, error: 'errors.saveFailed' } : result
  revalidatePath('/dashboard/media')
  revalidatePath(`/dashboard/content/${content_id}`)
  return { ok: true, data: { id: result.data.id }, message: 'media.posterSaved' }
}

/** Generate one AI picture for a poster or a reel scene (explicit owner action, one call). */
export async function generatePicture(input: unknown): Promise<ActionResult<{ id: string; url: string | null }>> {
  const { business, profile } = await requireOnboardedBusiness()
  const parsed = imageGenerationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const values = parsed.data
  const item = await getContentItem(values.content_id)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }
  const config = getMediaConfig()
  if (!config) return { ok: false, error: 'ai.error.notConfigured' }

  const prompt = buildImagePrompt({
    context: buildMarketingContext(business, profile),
    item: { title: item.title, product: item.product_name, description: item.description },
    purpose: values.purpose,
    aspectRatio: values.aspect_ratio,
    layout: values.template ? getPosterLayout(values.template) : undefined,
    visual: values.visual,
  })

  const started = await startGeneration({
    contentItemId: item.id,
    provider: config.provider,
    model: config.model,
    metadata: { purpose: values.purpose, aspect_ratio: values.aspect_ratio, template: values.template ?? null },
  })
  if (!started.ok || !started.data) return started.ok ? { ok: false, error: 'errors.saveFailed' } : started
  const assetId = started.data.id

  let image
  try {
    image = await generateMarketingImage({ prompt, aspectRatio: values.aspect_ratio })
  } catch (error) {
    await failGeneration(assetId)
    revalidatePath('/dashboard/media')
    return { ok: false, error: AI_ERROR_MESSAGES[error instanceof AIError ? error.code : 'unknown'] }
  }
  const saved = await finishGeneration(assetId, image.bytes, image.info, { provider: image.provider, model: image.model })
  revalidatePath('/dashboard/media')
  if (!saved.ok) return saved
  const urls = await getAssetUrls([assetId])
  return { ok: true, data: { id: assetId, url: urls[assetId] ?? null } }
}

export async function deleteMedia(id: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = mediaIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'media.error.notFound' }
  const result = await deleteMediaAsset(parsed.data)
  if (!result.ok) return result
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'media.deleted' }
}
