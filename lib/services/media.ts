import 'server-only'
import { getBusiness, requireUser } from '@/lib/auth/dal'
import { GENERATION_STALE_MS, MEDIA_BUCKET, MEDIA_EXTENSIONS, type MediaAssetType, type MediaSourceType } from '@/lib/config/media'
import type { ImageInfo } from '@/lib/media/image-file'
import type { Storyboard } from '@/lib/media/storyboard'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { dbError, type ServiceResult } from './errors'
import { log } from '@/lib/observability/log'

/*
 * Media writes. Callers validate input (lib/validation/media.ts) and file bytes
 * (lib/media/image-file.ts) first. Ownership always comes from the verified session:
 * files are stored under `<owner_id>/`, rows get the owner's own business, every query
 * filters by owner_id, and RLS (table + storage) enforces the same rules.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

const newPath = (ownerId: string, info: ImageInfo) =>
  `${ownerId}/${globalThis.crypto.randomUUID()}.${MEDIA_EXTENSIONS[info.mimeType]}`

async function upload(supabase: Supabase, path: string, bytes: Uint8Array, info: ImageInfo): Promise<boolean> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: info.mimeType, upsert: false })
  if (error) log.error('[storage] upload', error.message)
  return !error
}

async function removeFile(supabase: Supabase, path: string) {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path])
  if (error) log.error('[storage] remove', error.message)
}

const fileColumns = (path: string, info: ImageInfo) => ({
  storage_path: path,
  mime_type: info.mimeType,
  width: info.width,
  height: info.height,
  file_size: info.size,
})

/** Store a validated image and create its READY asset. The file is removed again if the row cannot be saved. */
export async function storeMedia(input: {
  bytes: Uint8Array
  info: ImageInfo
  assetType: MediaAssetType
  sourceType: MediaSourceType
  contentItemId: string | null
  metadata?: Record<string, unknown>
}): Promise<ServiceResult<{ id: string }>> {
  const user = await requireUser()
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return { ok: false, error: 'errors.saveFailed' }

  const supabase = await createClient()
  const path = newPath(user.id, input.info)
  if (!(await upload(supabase, path, input.bytes, input.info))) return { ok: false, error: 'media.error.uploadFailed' }

  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      owner_id: user.id,
      business_id: business.id,
      content_item_id: input.contentItemId,
      asset_type: input.assetType,
      source_type: input.sourceType,
      status: 'READY',
      ...fileColumns(path, input.info),
      metadata: (input.metadata ?? {}) as Json,
    })
    .select('id')
    .single()
  if (error) {
    await removeFile(supabase, path)
    return dbError(error)
  }
  return { ok: true, data: { id: data.id } }
}

/**
 * Reserve an AI picture generation (status GENERATING). A database index allows only one
 * per owner at a time, so double clicks or a second tab cannot start a second paid call.
 */
export async function startGeneration(input: {
  contentItemId: string
  provider: string
  model: string
  metadata: Record<string, unknown>
}): Promise<ServiceResult<{ id: string }>> {
  const user = await requireUser()
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return { ok: false, error: 'errors.saveFailed' }
  const supabase = await createClient()

  // A generation that never finished (e.g. the server was stopped) no longer blocks.
  await supabase
    .from('media_assets')
    .update({ status: 'FAILED' })
    .eq('owner_id', user.id)
    .eq('status', 'GENERATING')
    .lt('created_at', new Date(Date.now() - GENERATION_STALE_MS).toISOString())

  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      owner_id: user.id,
      business_id: business.id,
      content_item_id: input.contentItemId,
      asset_type: 'IMAGE',
      source_type: 'AI_GENERATED',
      status: 'GENERATING',
      provider: input.provider,
      model: input.model,
      metadata: input.metadata as Json,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'media.error.busy' }
    return dbError(error)
  }
  return { ok: true, data: { id: data.id } }
}

/** Store the generated picture and mark the generation READY. */
export async function finishGeneration(id: string, bytes: Uint8Array, info: ImageInfo, actual: { provider: string; model: string }): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const path = newPath(user.id, info)
  if (!(await upload(supabase, path, bytes, info))) {
    await failGeneration(id)
    return { ok: false, error: 'media.error.uploadFailed' }
  }
  const { data, error } = await supabase
    .from('media_assets')
    .update({ status: 'READY', ...fileColumns(path, info), provider: actual.provider, model: actual.model })
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('status', 'GENERATING')
    .select('id')
  if (error || !data?.length) {
    await removeFile(supabase, path)
    await failGeneration(id)
    return error ? dbError(error) : { ok: false, error: 'media.error.uploadFailed' }
  }
  return { ok: true }
}

/** Never READY: a failed generation is kept as FAILED (the owner can delete it). */
export async function failGeneration(id: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('media_assets').update({ status: 'FAILED' }).eq('id', id).eq('owner_id', user.id).eq('status', 'GENERATING')
  if (error) log.error('[db] fail generation', error.code, error.message)
}

/** Delete an owned asset and its file. */
export async function deleteMediaAsset(id: string): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('media_assets').delete().eq('id', id).eq('owner_id', user.id).select('storage_path')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'media.error.notFound' }
  if (data[0].storage_path) await removeFile(supabase, data[0].storage_path)
  return { ok: true }
}

/** Ids among `ids` that are the owner's own READY pictures. */
export async function ownedPictureIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('media_assets')
    .select('id')
    .eq('owner_id', user.id)
    .eq('asset_type', 'IMAGE')
    .eq('status', 'READY')
    .in('id', [...new Set(ids)])
  if (error) {
    log.error('[db] owned pictures', error.code, error.message)
    return new Set()
  }
  return new Set(data.map((r) => r.id))
}

/** Save a reel storyboard on the owner's REEL content item. */
export async function saveStoryboard(contentId: string, storyboard: Storyboard): Promise<ServiceResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_items')
    .update({ storyboard: storyboard as unknown as Json })
    .eq('id', contentId)
    .eq('owner_id', user.id)
    .eq('content_type', 'REEL')
    .select('id')
  if (error) return dbError(error)
  if (!data?.length) return { ok: false, error: 'errors.contentNotFound' }
  return { ok: true }
}
