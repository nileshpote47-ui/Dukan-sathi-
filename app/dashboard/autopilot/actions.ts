'use server'

import { revalidatePath } from 'next/cache'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { AUTOPILOT_LEAD_MINUTES, AUTOPILOT_POSTER_RATIO } from '@/lib/config/autopilot'
import { ASPECT_RATIOS } from '@/lib/config/media'
import { isChannel, type Channel } from '@/lib/config/publishing'
import { getAutopilotPost, getAutopilotSettings } from '@/lib/data/autopilot'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import type { MessageKey } from '@/lib/i18n'
import { validateImage } from '@/lib/media/image-file'
import { posterDefaults } from '@/lib/media/poster-defaults'
import { defaultCaption } from '@/lib/publishing/compose'
import { decideAutopilotPost, saveAutopilotSettings } from '@/lib/services/autopilot'
import { changeContentStatus } from '@/lib/services/content'
import { storeMedia } from '@/lib/services/media'
import { createPublication } from '@/lib/services/publishing'
import { isoToIstInput } from '@/lib/utils/datetime'
import { autopilotPostIdSchema, autopilotSettingsSchema } from '@/lib/validation/autopilot'
import type { ActionResult } from '@/lib/validation/result'
import { generatedCopySchema } from '@/services/ai/output'

/*
 * Autopilot actions. Every one re-checks the session; nothing here trusts ids or text from the browser beyond the
 * post id: the post, its content, the accounts and the plan are read on the server. Approving makes the poster
 * (rendered in the owner's browser from the post's own text, checked here) and schedules the post with the normal
 * publishing system — that is the owner's explicit approval.
 */

export async function saveAutopilotSettingsAction(input: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = autopilotSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const result = await saveAutopilotSettings(parsed.data)
  if (!result.ok) return result
  revalidatePath('/dashboard/autopilot')
  return { ok: true, message: parsed.data.enabled ? 'autopilot.savedOn' : 'autopilot.savedOff' }
}

export async function skipAutopilotPostAction(id: unknown): Promise<ActionResult> {
  await requireOnboardedBusiness()
  const parsed = autopilotPostIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const result = await decideAutopilotPost(parsed.data, 'SKIPPED')
  if (!result.ok) return result
  revalidatePath('/dashboard/autopilot')
  return { ok: true }
}

async function readFile(value: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!(value instanceof Blob)) return null
  return new Uint8Array(await value.arrayBuffer())
}

export async function approveAutopilotPostAction(formData: FormData): Promise<ActionResult<{ jobs: number }>> {
  const { business } = await requireOnboardedBusiness()
  const parsed = autopilotPostIdSchema.safeParse(formData.get('id'))
  if (!parsed.success) return { ok: false, error: 'errors.validation' }
  const [post, settings, billing, accounts] = await Promise.all([getAutopilotPost(parsed.data), getAutopilotSettings(), getBillingOverview(), listSocialAccounts()])
  if (!post?.content || post.status !== 'PENDING') return { ok: false, error: 'autopilot.error.decided' }
  if ((billing.currentPlan.autopilot_posts_per_week ?? 0) < 1) return { ok: false, error: 'autopilot.error.plan' }
  const connected = new Map(accounts.filter((a) => a.status === 'CONNECTED' && isChannel(a.channel)).map((a) => [a.id, a.channel as Channel]))
  const accountIds = (settings?.account_ids ?? []).filter((id) => connected.has(id))
  if (!accountIds.length) return { ok: false, error: 'autopilot.error.chooseAccount' }

  // The poster, drawn in the browser from this post's own text, checked by content and size here.
  const bytes = await readFile(formData.get('file'))
  if (!bytes) return { ok: false, error: 'media.error.notImage' }
  const checked = validateImage(bytes)
  const size = ASPECT_RATIOS[AUTOPILOT_POSTER_RATIO]
  if (!checked.ok || checked.info.width !== size.width || checked.info.height !== size.height || checked.info.mimeType === 'image/webp') {
    return { ok: false, error: 'media.error.dimensions' }
  }

  const item = post.content
  const copy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
  const spec = posterDefaults({ ...item, template: null }, copy.success ? copy.data : null, business)
  const media = await storeMedia({
    bytes,
    info: checked.info,
    assetType: 'POSTER',
    sourceType: 'TEMPLATE_RENDERED',
    contentItemId: item.id,
    metadata: { template: spec.template, aspect_ratio: AUTOPILOT_POSTER_RATIO, texts: spec.texts, image_asset_id: null, autopilot: true },
  })
  if (!media.ok || !media.data) return media.ok ? { ok: false, error: 'errors.saveFailed' } : media

  if (item.status === 'DRAFT') {
    const ready = await changeContentStatus(item.id, 'READY', null)
    if (!ready.ok) return ready
  }

  // At its planned time, or a little later when that time is too close or has passed.
  const earliest = Date.now() + AUTOPILOT_LEAD_MINUTES * 60_000
  const when = new Date(Math.max(Date.parse(post.planned_for), earliest))
  const captions = Object.fromEntries(accountIds.map((id) => connected.get(id)!).map((c) => [c, defaultCaption(c, item, copy.success ? copy.data : null)]))
  const published = await createPublication({
    contentId: item.id,
    accountIds,
    mediaAssetId: media.data.id,
    captions,
    mode: 'schedule',
    scheduledFor: isoToIstInput(when.toISOString()),
    confirm: true,
  })
  if (!published.ok) return { ok: false, error: published.error as MessageKey }
  const jobIds = published.results.filter((r) => r.jobId).map((r) => r.jobId!)
  if (!jobIds.length) return { ok: false, error: published.results[0]?.error ?? 'errors.saveFailed' }
  const decided = await decideAutopilotPost(post.id, 'SCHEDULED', jobIds)
  if (!decided.ok) return decided
  revalidatePath('/dashboard/autopilot')
  revalidatePath('/dashboard/publishing')
  return { ok: true, data: { jobs: jobIds.length }, message: 'autopilot.approved' }
}
