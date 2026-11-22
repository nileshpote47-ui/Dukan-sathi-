import 'server-only'
import { requireUser } from '@/lib/auth/dal'
import { MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/lib/config/media'
import { VOICEOVER_FOLDER, type VoiceId } from '@/lib/config/voiceover'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { voiceoverRecordSchema } from '@/lib/validation/voiceover'

export interface VoiceoverView {
  url: string
  downloadUrl: string | null
  voice: VoiceId
  createdAt: string
}

/** Signed links for the owner's current reel voiceover (only files in their own voiceover folder). */
export async function getVoiceoverView(raw: unknown, contentId: string): Promise<VoiceoverView | null> {
  const record = voiceoverRecordSchema.safeParse(raw ?? undefined)
  if (!record.success) return null
  const user = await requireUser()
  if (!record.data.path.startsWith(`${user.id}/${VOICEOVER_FOLDER}/${contentId}/`)) return null
  const supabase = await createClient()
  const bucket = supabase.storage.from(MEDIA_BUCKET)
  const [play, download] = await Promise.all([
    bucket.createSignedUrl(record.data.path, SIGNED_URL_TTL_SECONDS),
    bucket.createSignedUrl(record.data.path, SIGNED_URL_TTL_SECONDS, { download: `dukaan-sathi-voiceover-${contentId.slice(0, 8)}.mp3` }),
  ])
  if (play.error || !play.data?.signedUrl) {
    log.error('[storage] sign voiceover', play.error?.message)
    return null
  }
  return { url: play.data.signedUrl, downloadUrl: download.data?.signedUrl ?? null, voice: record.data.voice, createdAt: record.data.created_at }
}
