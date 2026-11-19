import 'server-only'
import { cache } from 'react'
import { requireUser } from '@/lib/auth/dal'
import { GENERATION_STALE_MS, MEDIA_BUCKET, MEDIA_EXTENSIONS, MEDIA_PAGE_SIZE, SIGNED_URL_TTL_SECONDS, type MediaMimeType, type MediaStatus } from '@/lib/config/media'
import { createClient } from '@/lib/supabase/server'
import { mediaIdSchema, type MediaListParams } from '@/lib/validation/media'
import type { Tables } from '@/types/database'

/*
 * Media reads. Every function verifies the signed-in user and filters by owner_id; RLS
 * enforces the same in the database and in storage. Files are private: pages get
 * short-lived signed URLs created on the server for the owner's own files only.
 */

export type MediaAsset = Tables<'media_assets'>
export type MediaAssetView = MediaAsset & {
  content: { id: string; title: string } | null
  /** Signed URL for viewing (READY assets only). */
  url: string | null
  /** What the owner should see: a generation stuck in GENERATING counts as FAILED. */
  displayStatus: MediaStatus
}

const COLUMNS = '*, content:content_items(id, title)'

function fail(what: string, error: { code?: string; message: string }): never {
  console.error(`[db] ${what}`, error.code, error.message)
  throw new Error(`Could not load ${what}`)
}

export function displayStatus(asset: Pick<MediaAsset, 'status' | 'created_at'>, now = Date.now()): MediaStatus {
  if (asset.status === 'GENERATING' && now - new Date(asset.created_at).getTime() > GENERATION_STALE_MS) return 'FAILED'
  return asset.status as MediaStatus
}

/** Signed view URLs for many files in one request. */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.error('[storage] sign', error.message)
    return urls
  }
  for (const entry of data ?? []) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  return urls
}

async function withUrls(rows: (MediaAsset & { content: { id: string; title: string } | null })[]): Promise<MediaAssetView[]> {
  const urls = await signPaths(rows.filter((r) => r.status === 'READY' && r.storage_path).map((r) => r.storage_path!))
  const now = Date.now()
  return rows.map((r) => ({ ...r, url: r.storage_path ? (urls.get(r.storage_path) ?? null) : null, displayStatus: displayStatus(r, now) }))
}

export async function listMediaAssets(params: MediaListParams): Promise<{ items: MediaAssetView[]; total: number }> {
  const user = await requireUser()
  const supabase = await createClient()
  const from = (params.page - 1) * MEDIA_PAGE_SIZE
  let query = supabase
    .from('media_assets')
    .select(COLUMNS, { count: 'exact' })
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + MEDIA_PAGE_SIZE - 1)
  if (params.type) query = query.eq('asset_type', params.type)
  const { data, error, count } = await query
  if (error) fail('media', error)
  return { items: await withUrls(data ?? []), total: count ?? 0 }
}

/** One asset (with a view URL and a download URL), or null if missing / not yours. */
export const getMediaAsset = cache(async (id: string): Promise<(MediaAssetView & { downloadUrl: string | null }) | null> => {
  if (!mediaIdSchema.safeParse(id).success) return null
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('media_assets').select(COLUMNS).eq('id', id).eq('owner_id', user.id).maybeSingle()
  if (error) fail('media', error)
  if (!data) return null
  const [view] = await withUrls([data])
  let downloadUrl: string | null = null
  if (data.status === 'READY' && data.storage_path) {
    const ext = MEDIA_EXTENSIONS[data.mime_type as MediaMimeType] ?? 'png'
    const name = `dukaan-sathi-${data.asset_type.toLowerCase()}-${data.id.slice(0, 8)}.${ext}`
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS, { download: name })
    downloadUrl = signed?.signedUrl ?? null
  }
  return { ...view, downloadUrl }
})

/** Ready pictures (IMAGE) for the picture pickers, newest first. */
export async function listPictures(limit = 30): Promise<MediaAssetView[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('media_assets')
    .select(COLUMNS)
    .eq('owner_id', user.id)
    .eq('asset_type', 'IMAGE')
    .eq('status', 'READY')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail('pictures', error)
  return withUrls(data ?? [])
}

/** Ready media made for one content item. */
export async function listMediaForContent(contentId: string, limit = 12): Promise<MediaAssetView[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('media_assets')
    .select(COLUMNS)
    .eq('owner_id', user.id)
    .eq('content_item_id', contentId)
    .eq('status', 'READY')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail('content media', error)
  return withUrls(data ?? [])
}

/** Signed URLs for specific owned, ready assets (e.g. pictures referenced by a storyboard). */
export async function getAssetUrls(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter((id) => mediaIdSchema.safeParse(id).success)
  if (!unique.length) return {}
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('media_assets')
    .select('id, storage_path')
    .eq('owner_id', user.id)
    .eq('status', 'READY')
    .in('id', unique)
  if (error) fail('media urls', error)
  const urls = await signPaths((data ?? []).map((r) => r.storage_path!).filter(Boolean))
  const result: Record<string, string> = {}
  for (const row of data ?? []) {
    const url = row.storage_path && urls.get(row.storage_path)
    if (url) result[row.id] = url
  }
  return result
}
