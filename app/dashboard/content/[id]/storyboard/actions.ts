'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { withUsage } from '@/lib/billing/usage'
import { getContentItem } from '@/lib/data/content'
import { buildStoryboard, hasReelCopy, type Storyboard } from '@/lib/media/storyboard'
import { ownedPictureIds, saveStoryboard as saveStoryboardService } from '@/lib/services/media'
import { contentIdSchema } from '@/lib/validation/content'
import { saveStoryboardSchema, storyboardSchema } from '@/lib/validation/media'
import { voiceoverRecordSchema, voiceoverRequestSchema } from '@/lib/validation/voiceover'
import { AI_ERROR_MESSAGES } from '@/lib/ai/error-messages'
import { DEFAULT_LANGUAGE, isLanguageCode } from '@/lib/config/languages'
import { VOICEOVER_MAX_CHARS, VOICEOVER_MIN_CHARS } from '@/lib/config/voiceover'
import { voiceoverText } from '@/lib/media/voiceover-text'
import { saveVoiceover } from '@/lib/services/voiceover'
import { AIError } from '@/services/ai/types'
import { isVoiceConfigured } from '@/services/voice/provider'
import { generateVoiceover } from '@/services/voice/service'
import type { ActionResult } from '@/lib/validation/result'
import { generatedCopySchema } from '@/services/ai/output'

/*
 * Reel storyboard actions. The structure is built on the server from the item's SAVED
 * Phase 3 reel copy (never from text sent by the browser). Nothing is saved until the
 * owner reviews and presses Save.
 */

export async function generateStoryboard(contentId: unknown): Promise<ActionResult<{ storyboard: Storyboard }>> {
  const { business } = await requireOnboardedBusiness()
  const id = contentIdSchema.safeParse(contentId)
  if (!id.success) return { ok: false, error: 'errors.contentNotFound' }
  const item = await getContentItem(id.data)
  if (!item || item.content_type !== 'REEL') return { ok: false, error: 'errors.contentNotFound' }
  const copy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  if (!copy.success || !hasReelCopy(copy.data)) return { ok: false, error: 'reel.error.noCopy' }

  // Plan limit (Phase 5): each generated storyboard counts as one reel generation.
  return withUsage('reel_generation', { type: 'content_item', id: item.id }, async () => {
    const storyboard = buildStoryboard({
      title: item.title,
      language: item.language,
      productName: item.product_name,
      businessName: business.business_name,
      copy: copy.data,
    })
    return { ok: true, data: { storyboard } }
  })
}

export async function saveStoryboard(input: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = saveStoryboardSchema.safeParse(input)
  if (!parsed.success) {
    const durationProblem = parsed.error.issues.some((i) => i.path.includes('total_duration') || i.path.includes('scenes'))
    return { ok: false, error: durationProblem ? 'reel.error.limits' : 'errors.validation' }
  }
  const { content_id, storyboard } = parsed.data
  const item = await getContentItem(content_id)
  if (!item || item.content_type !== 'REEL') return { ok: false, error: 'errors.contentNotFound' }
  if (item.status === 'ARCHIVED') return { ok: false, error: 'errors.archivedReadOnly' }

  // Every assigned picture must be one of the owner's own ready pictures.
  const assigned = storyboard.scenes.map((s) => s.asset_id).filter((v): v is string => Boolean(v))
  const owned = await ownedPictureIds(assigned)
  if (assigned.some((assetId) => !owned.has(assetId))) return { ok: false, error: 'media.error.notFound' }

  const result = await saveStoryboardService(content_id, storyboard)
  if (!result.ok) return result
  revalidatePath(`/dashboard/content/${content_id}`)
  return { ok: true, message: 'reel.saved' }
}

/**
 * Read the SAVED storyboard's voiceover lines aloud (owner's own words, word for word) in the item's
 * language, with the chosen voice. One explicit tap = one metered voiceover; any failure releases it.
 */
export async function generateVoiceoverAction(input: unknown): Promise<ActionResult<{ createdAt: string }>> {
  await requireOnboardedBusiness()
  const parsed = voiceoverRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const { content_id, voice } = parsed.data
  if (!isVoiceConfigured()) return { ok: false, error: 'voiceover.error.notConfigured' }

  const item = await getContentItem(content_id)
  if (!item || item.content_type !== 'REEL') return { ok: false, error: 'errors.contentNotFound' }
  if (item.status === 'ARCHIVED') return { ok: false, error: 'errors.archivedReadOnly' }
  const saved = item.storyboard ? storyboardSchema.safeParse(item.storyboard) : null
  if (!saved?.success) return { ok: false, error: 'voiceover.error.noLines' }
  const text = voiceoverText(saved.data)
  if (text.length < VOICEOVER_MIN_CHARS) return { ok: false, error: 'voiceover.error.noLines' }
  if (text.length > VOICEOVER_MAX_CHARS) return { ok: false, error: 'voiceover.error.tooLong' }
  const language = isLanguageCode(item.language) ? item.language : DEFAULT_LANGUAGE
  const previous = voiceoverRecordSchema.safeParse(item.voiceover ?? undefined)

  const result = await withUsage('voiceover', { type: 'content_item', id: item.id }, async (): Promise<ActionResult<{ createdAt: string }>> => {
    let audio: Awaited<ReturnType<typeof generateVoiceover>>
    try {
      audio = await generateVoiceover({ text, language, voice })
    } catch (error) {
      return { ok: false, error: AI_ERROR_MESSAGES[error instanceof AIError ? error.code : 'unknown'] }
    }
    const stored = await saveVoiceover(item.id, audio.bytes, { voice, language, chars: text.length }, previous.success ? previous.data.path : null)
    if (!stored.ok) return stored
    return { ok: true, data: { createdAt: stored.data!.created_at }, message: 'voiceover.ready' }
  })
  if (result.ok) revalidatePath(`/dashboard/content/${item.id}/storyboard`)
  return result
}
