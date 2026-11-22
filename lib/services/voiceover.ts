import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { MEDIA_BUCKET } from '@/lib/config/media'
import { VOICEOVER_FOLDER, VOICEOVER_MIME, type VoiceId } from '@/lib/config/voiceover'
import type { LanguageCode } from '@/lib/config/languages'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { dbError, type ServiceResult } from './errors'

/** What is stored on content_items.voiceover (never the text or any secret). */
export interface VoiceoverRecord {
  path: string
  voice: VoiceId
  language: LanguageCode
  chars: number
  created_at: string
}

/**
 * Store a new voiceover for the owner's REEL item: upload the MP3 under `<owner_id>/voiceovers/<content_id>/`,
 * point the item at it, then remove the previous file. Ownership comes from the session only.
 */
export async function saveVoiceover(
  contentId: string,
  bytes: Uint8Array,
  meta: { voice: VoiceId; language: LanguageCode; chars: number },
  previousPath: string | null,
): Promise<ServiceResult<VoiceoverRecord>> {
  const user = await requireUser()
  const supabase = await createClient()
  const path = `${user.id}/${VOICEOVER_FOLDER}/${contentId}/${globalThis.crypto.randomUUID()}.mp3`
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: VOICEOVER_MIME, upsert: false })
  if (uploadError) {
    log.error('[storage] voiceover upload', uploadError.message)
    return { ok: false, error: 'media.error.uploadFailed' }
  }
  const record: VoiceoverRecord = { path, ...meta, created_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('content_items')
    .update({ voiceover: record as unknown as Json })
    .eq('id', contentId)
    .eq('owner_id', user.id)
    .eq('content_type', 'REEL')
    .select('id')
  if (error || !data?.length) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
    return error ? dbError(error) : { ok: false, error: 'errors.contentNotFound' }
  }
  if (previousPath && previousPath.startsWith(`${user.id}/${VOICEOVER_FOLDER}/`)) {
    const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([previousPath])
    if (removeError) log.error('[storage] old voiceover remove', removeError.message)
  }
  return { ok: true, data: record }
}
