import 'server-only'
import sharp, { type OutputInfo } from 'sharp'
import { MEDIA_BUCKET } from '@/lib/config/media'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/observability/log'

/*
 * Prepare a picture for publishing (runs with the owner's session):
 *   owner's READY asset → download from the private bucket → JPEG (Instagram accepts JPEG only;
 *   max 1440 px wide, white background for transparency) → stored as
 *   <owner_id>/publishing/<uuid>.jpg → signed URL valid until the post is due + 2 days.
 * Platforms fetch the picture from that URL; the bucket stays private and the link expires.
 */

const MAX_WIDTH = 1440
const URL_GRACE_SECONDS = 2 * 24 * 60 * 60

export interface PreparedMedia {
  path: string
  url: string
  width: number
  height: number
  bytes: number
}

export async function preparePublishingMedia(input: {
  ownerId: string
  assetId: string
  publishAt: Date
}): Promise<{ ok: true; media: PreparedMedia } | { ok: false; reason: 'not_found' | 'unreadable' | 'storage' }> {
  const supabase = await createClient()
  const { data: asset } = await supabase
    .from('media_assets')
    .select('storage_path, status')
    .eq('id', input.assetId)
    .eq('owner_id', input.ownerId)
    .eq('status', 'READY')
    .maybeSingle()
  if (!asset?.storage_path) return { ok: false, reason: 'not_found' }

  const { data: file, error: downloadError } = await supabase.storage.from(MEDIA_BUCKET).download(asset.storage_path)
  if (downloadError || !file) return { ok: false, reason: 'storage' }

  let jpeg: { data: Buffer; info: OutputInfo }
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 4096 * 4096 })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  const path = `${input.ownerId}/publishing/${globalThis.crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, jpeg.data, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) {
    log.error('[publishing] media upload', uploadError.message)
    return { ok: false, reason: 'storage' }
  }
  const expiresIn = Math.max(3600, Math.ceil((input.publishAt.getTime() - Date.now()) / 1000) + URL_GRACE_SECONDS)
  const { data: signed, error: signError } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn)
  if (signError || !signed?.signedUrl) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
    return { ok: false, reason: 'storage' }
  }
  return { ok: true, media: { path, url: signed.signedUrl, width: jpeg.info.width, height: jpeg.info.height, bytes: jpeg.info.size } }
}

/** A fresh link for an already prepared picture (manual retry after the old link expired). */
export async function resignPublishingMedia(path: string, ownerId: string, publishAt: Date): Promise<string | null> {
  if (!path.startsWith(`${ownerId}/publishing/`)) return null
  const supabase = await createClient()
  const expiresIn = Math.max(3600, Math.ceil((publishAt.getTime() - Date.now()) / 1000) + URL_GRACE_SECONDS)
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

export async function removePublishingMedia(path: string | null | undefined, ownerId: string) {
  if (!path || !path.startsWith(`${ownerId}/publishing/`)) return
  const supabase = await createClient()
  await supabase.storage.from(MEDIA_BUCKET).remove([path])
}
