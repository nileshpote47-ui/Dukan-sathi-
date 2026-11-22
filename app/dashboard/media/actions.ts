'use server'

import { revalidatePath } from 'next/cache'
import { AI_ERROR_MESSAGES } from '@/lib/ai/error-messages'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { commitUsage, releaseUsage, reserveUsage, withUsage } from '@/lib/billing/usage'
import { ASPECT_RATIOS, DIRECT_POSTER_KIND } from '@/lib/config/media'
import { getPosterLayout } from '@/lib/config/poster-templates'
import { getContentItem } from '@/lib/data/content'
import { getAssetUrls } from '@/lib/data/media'
import type { MessageKey } from '@/lib/i18n'
import { validateImage, type ImageProblem } from '@/lib/media/image-file'
import { buildMarketingContext } from '@/lib/marketing/context'
import { confirmDirectPoster, deleteMediaAsset, failGeneration, finishGeneration, ownedPictureIds, startGeneration, storeMedia } from '@/lib/services/media'
import { directPosterSchema, imageGenerationSchema, mediaIdSchema, posterSpecSchema } from '@/lib/validation/media'
import type { ActionResult } from '@/lib/validation/result'
import { buildDirectPosterPrompt, buildImagePrompt } from '@/services/media/prompts'
import { getDirectPosterConfig, getMediaConfig } from '@/services/media/provider'
import { generateDirectPoster, generateMarketingImage } from '@/services/media/service'
import { AIError } from '@/services/ai/types'
import { z } from 'zod'
import { allowRequest } from '@/lib/security/rate-limit'
import { stockSaveSchema, stockSearchSchema } from '@/lib/validation/stock'
import { isStockConfigured } from '@/services/stock/provider'
import { lookupStockPhoto, searchStockPhotos } from '@/services/stock/service'
import { StockError, type StockSearchResult } from '@/services/stock/types'

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
  // Plan limit (Phase 5): a saved poster counts as one media export; not charged if saving fails.
  return withUsage('media_export', { type: 'content_item', id: content_id }, async () => {
    const result = await storeMedia({ bytes, info: checked.info, assetType: 'POSTER', sourceType: 'TEMPLATE_RENDERED', contentItemId: content_id, metadata })
    if (!result.ok || !result.data) return result.ok ? { ok: false, error: 'errors.saveFailed' } : result
    revalidatePath('/dashboard/media')
    revalidatePath(`/dashboard/content/${content_id}`)
    return { ok: true, data: { id: result.data.id }, message: 'media.posterSaved' }
  })
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

  // Plan limit (Phase 5): reserve one AI picture; released below if anything fails.
  const reservation = await reserveUsage('image_generation', { type: 'content_item', id: item.id })
  if (!reservation.ok) return { ok: false, error: reservation.error }

  const started = await startGeneration({
    contentItemId: item.id,
    provider: config.provider,
    model: config.model,
    metadata: { purpose: values.purpose, aspect_ratio: values.aspect_ratio, template: values.template ?? null },
  })
  if (!started.ok || !started.data) {
    await releaseUsage(reservation.id)
    return started.ok ? { ok: false, error: 'errors.saveFailed' } : started
  }
  const assetId = started.data.id

  let image
  try {
    image = await generateMarketingImage({ prompt, aspectRatio: values.aspect_ratio })
  } catch (error) {
    await failGeneration(assetId)
    await releaseUsage(reservation.id)
    revalidatePath('/dashboard/media')
    return { ok: false, error: AI_ERROR_MESSAGES[error instanceof AIError ? error.code : 'unknown'] }
  }
  const saved = await finishGeneration(assetId, image.bytes, image.info, { provider: image.provider, model: image.model })
  revalidatePath('/dashboard/media')
  if (!saved.ok) {
    await releaseUsage(reservation.id)
    return saved
  }
  // The picture exists and is stored: charge it (commit can only fail if the reservation went stale).
  if (!(await commitUsage(reservation.id))) return { ok: false, error: 'billing.error.usage' }
  const urls = await getAssetUrls([assetId])
  return { ok: true, data: { id: assetId, url: urls[assetId] ?? null } }
}

/**
 * "Let AI design the whole poster" (Phase 9, explicit owner action, one paid call): the owner's
 * own lines go to the image model word for word. The poster is stored but kept out of publishing
 * until the owner confirms its text, price and offer (confirmDirectPosterAction).
 */
export async function generateDirectPosterAction(input: unknown): Promise<ActionResult<{ id: string; url: string | null }>> {
  const { business, profile } = await requireOnboardedBusiness()
  const parsed = directPosterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const values = parsed.data
  const item = await getContentItem(values.content_id)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }
  const config = getDirectPosterConfig()
  if (!config) return { ok: false, error: 'ai.error.notConfigured' }

  const prompt = buildDirectPosterPrompt({
    context: buildMarketingContext(business, profile),
    item: { title: item.title, product: item.product_name, description: item.description },
    aspectRatio: values.aspect_ratio,
    layout: getPosterLayout(values.template),
    texts: values.texts,
  })

  // Plan limit (direct_poster) + burst limit; released below if anything fails.
  const reservation = await reserveUsage('direct_poster', { type: 'content_item', id: item.id })
  if (!reservation.ok) return { ok: false, error: reservation.error }

  const started = await startGeneration({
    contentItemId: item.id,
    provider: config.provider,
    model: config.model,
    assetType: 'POSTER',
    metadata: { kind: DIRECT_POSTER_KIND, reviewed: false, template: values.template, aspect_ratio: values.aspect_ratio, texts: values.texts },
  })
  if (!started.ok || !started.data) {
    await releaseUsage(reservation.id)
    return started.ok ? { ok: false, error: 'errors.saveFailed' } : started
  }
  const assetId = started.data.id

  let poster
  try {
    poster = await generateDirectPoster({ prompt, aspectRatio: values.aspect_ratio })
  } catch (error) {
    await failGeneration(assetId)
    await releaseUsage(reservation.id)
    revalidatePath('/dashboard/media')
    return { ok: false, error: AI_ERROR_MESSAGES[error instanceof AIError ? error.code : 'unknown'] }
  }
  const saved = await finishGeneration(assetId, poster.bytes, poster.info, { provider: poster.provider, model: poster.model })
  revalidatePath('/dashboard/media')
  if (!saved.ok) {
    await releaseUsage(reservation.id)
    return saved
  }
  if (!(await commitUsage(reservation.id))) return { ok: false, error: 'billing.error.usage' }
  const urls = await getAssetUrls([assetId])
  return { ok: true, data: { id: assetId, url: urls[assetId] ?? null } }
}

/** The owner checked the direct poster's text, price and offer: it can now be published. */
export async function confirmDirectPosterAction(id: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = mediaIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'media.error.notFound' }
  const result = await confirmDirectPoster(parsed.data)
  if (!result.ok) return result
  revalidatePath('/dashboard', 'layout')
  return { ok: true, message: 'directPoster.confirmed' }
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

const STOCK_ERRORS: Record<StockError['code'], MessageKey> = {
  not_configured: 'stock.error.notConfigured',
  rate_limited: 'stock.error.busy',
  not_found: 'stock.error.notFound',
  unavailable: 'stock.error.unavailable',
  invalid_response: 'stock.error.unavailable',
}

/** Search free stock photos (Pixabay). Results are cached for 24 hours; nothing is stored. */
export async function searchStockPhotosAction(input: unknown): Promise<ActionResult<StockSearchResult>> {
  await requireOnboardedBusiness()
  const parsed = stockSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'stock.error.query' }
  if (!(await allowRequest('stock_search'))) return { ok: false, error: 'errors.rateLimited' }
  try {
    return { ok: true, data: await searchStockPhotos(parsed.data.query, parsed.data.page) }
  } catch (error) {
    return { ok: false, error: STOCK_ERRORS[error instanceof StockError ? error.code : 'unavailable'] }
  }
}

/**
 * Save a chosen stock photo as the owner's own picture. The owner's browser downloads the photo (Pixabay refuses
 * server downloads from shared hosting addresses) and uploads it here; the server checks the file by content,
 * confirms the photo id with the provider (credits come from the provider, never from the browser) and stores it
 * in the owner's private folder.
 */
export async function saveStockPhotoAction(formData: FormData): Promise<ActionResult<{ id: string; url: string | null }>> {
  await requireOnboardedBusiness()
  const parsed = stockSaveSchema.safeParse({ photo_id: formData.get('photo_id'), content_id: formData.get('content_id') ?? undefined })
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const { photo_id, content_id } = parsed.data
  if (content_id && !(await getContentItem(content_id))) return { ok: false, error: 'errors.contentNotFound' }
  if (!isStockConfigured()) return { ok: false, error: 'stock.error.notConfigured' }
  if (!(await allowRequest('stock_save'))) return { ok: false, error: 'errors.rateLimited' }

  const bytes = await readFile(formData.get('file'))
  if (!bytes) return { ok: false, error: 'media.error.notImage' }
  const checked = validateImage(bytes)
  if (!checked.ok) return { ok: false, error: FILE_PROBLEMS[checked.problem] }

  let photo: Awaited<ReturnType<typeof lookupStockPhoto>>
  try {
    photo = await lookupStockPhoto(photo_id)
  } catch (error) {
    return { ok: false, error: STOCK_ERRORS[error instanceof StockError ? error.code : 'unavailable'] }
  }

  const result = await storeMedia({
    bytes,
    info: checked.info,
    assetType: 'IMAGE',
    sourceType: 'STOCK',
    contentItemId: content_id,
    metadata: { stock: { provider: photo.provider, photo_id, photographer: photo.photographer, page_url: photo.pageUrl } },
  })
  if (!result.ok || !result.data) return result.ok ? { ok: false, error: 'errors.saveFailed' } : result
  const urls = await getAssetUrls([result.data.id])
  revalidatePath('/dashboard/media')
  return { ok: true, data: { id: result.data.id, url: urls[result.data.id] ?? null }, message: 'stock.saved' }
}
