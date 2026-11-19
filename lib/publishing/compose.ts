import { CHANNEL_RULES, PUBLISHING_LIMITS, canPublishToday, type Channel } from '@/lib/config/publishing'
import type { MessageKey } from '@/lib/i18n'
import type { AIContentResponse } from '@/services/ai/types'

/*
 * Channel output and validation, shared by the publish page (preview, instant feedback) and the
 * server (the real check before a job is created). Pure functions; limits come from
 * CHANNEL_RULES (lib/config/publishing.ts).
 */

interface ContentForCaption {
  title: string
  product_name: string | null
  offer_text: string | null
  description: string | null
  call_to_action: string | null
  price: string | null
}

const clean = (value: string | null | undefined) => value?.trim() || ''

/** A ready-to-edit caption from the saved AI copy, or from the owner's own details when there is none. */
export function defaultCaption(channel: Channel, item: ContentForCaption, copy: AIContentResponse | null): string {
  const parts = copy
    ? [clean(copy.headline), clean(copy.primary_text), clean(copy.short_text), clean(copy.call_to_action)]
    : [clean(item.product_name) || clean(item.title), clean(item.offer_text), clean(item.price), clean(item.description), clean(item.call_to_action)]
  let caption = parts.filter(Boolean).join('\n\n')
  // Hashtags help on Instagram/Facebook; Google Business Profile and WhatsApp do not use them.
  if (copy?.hashtags?.length && (channel === 'INSTAGRAM' || channel === 'FACEBOOK')) caption += `\n\n${copy.hashtags.join(' ')}`
  const max = CHANNEL_RULES[channel].maxCaption
  return caption.length > max ? caption.slice(0, max) : caption
}

export const countHashtags = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length
export const countMentions = (text: string) => (text.match(/(^|\s)@[\w.]+/g) ?? []).length

export interface MediaInfo {
  width: number
  height: number
  mimeType: string
}

export interface PublishDraft {
  channel: Channel
  caption: string
  media: MediaInfo | null
  scheduledFor: Date | null
  now?: Date
  whatsapp?: { templateChosen: boolean; params: string[]; paramCount: number; recipients: number; needsImage: boolean } | null
}

export interface ValidationIssue {
  key: MessageKey
  values?: Record<string, string | number>
}

/** Everything that would make the platform refuse the post, checked before a job exists. */
export function validateDraft(draft: PublishDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const rules = CHANNEL_RULES[draft.channel]
  const caption = draft.caption.trim()
  const now = draft.now ?? new Date()

  if (!canPublishToday(draft.channel)) {
    issues.push({ key: 'publishing.validation.needsVideo' })
    return issues
  }

  if (rules.media === 'template') {
    const wa = draft.whatsapp
    if (!wa?.templateChosen) issues.push({ key: 'publishing.validation.chooseTemplate' })
    else {
      if (wa.params.length !== wa.paramCount || wa.params.some((p) => !p.trim())) issues.push({ key: 'publishing.validation.fillParams' })
      if (wa.params.some((p) => p.length > 200 || /[\n\t]|\s{4,}/.test(p))) issues.push({ key: 'publishing.validation.paramFormat' })
      if (wa.needsImage && !draft.media) issues.push({ key: 'publishing.validation.needsImage' })
    }
    if (!wa?.recipients) issues.push({ key: 'publishing.validation.chooseRecipients' })
    if ((wa?.recipients ?? 0) > PUBLISHING_LIMITS.whatsappMaxRecipients) {
      issues.push({ key: 'publishing.validation.tooManyRecipients', values: { max: PUBLISHING_LIMITS.whatsappMaxRecipients } })
    }
  } else {
    if (!caption && !(draft.channel === 'FACEBOOK' && draft.media)) issues.push({ key: 'publishing.validation.captionRequired' })
    if (caption.length > rules.maxCaption) issues.push({ key: 'publishing.validation.captionTooLong', values: { max: rules.maxCaption } })
    if (rules.maxHashtags !== undefined && countHashtags(caption) > rules.maxHashtags) {
      issues.push({ key: 'publishing.validation.tooManyHashtags', values: { max: rules.maxHashtags } })
    }
    if (rules.maxMentions !== undefined && countMentions(caption) > rules.maxMentions) {
      issues.push({ key: 'publishing.validation.tooManyMentions', values: { max: rules.maxMentions } })
    }
    if (rules.media === 'image' && !draft.media) issues.push({ key: 'publishing.validation.needsImage' })
  }

  if (draft.media && rules.aspect) {
    const ratio = draft.media.width / draft.media.height
    if (ratio < rules.aspect.min - 0.005 || ratio > rules.aspect.max + 0.005) issues.push({ key: 'publishing.validation.aspect' })
  }

  if (draft.scheduledFor) {
    const lead = draft.scheduledFor.getTime() - now.getTime()
    if (Number.isNaN(lead) || lead < PUBLISHING_LIMITS.minLeadMinutes * 60_000) {
      issues.push({ key: 'publishing.validation.scheduleTooSoon', values: { minutes: PUBLISHING_LIMITS.minLeadMinutes } })
    } else if (lead > PUBLISHING_LIMITS.maxDaysAhead * 86_400_000) {
      issues.push({ key: 'publishing.validation.scheduleTooFar', values: { days: PUBLISHING_LIMITS.maxDaysAhead } })
    }
  }
  return issues
}

/** Shown text of a WhatsApp template with the owner's values filled in. */
export const fillTemplate = (body: string, params: string[]) =>
  body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => params[Number(n) - 1]?.trim() || `{{${n}}}`)

/** A queued job whose time is still ahead is shown as "Scheduled". */
export const isScheduledLater = (status: string, scheduledFor: string | null | undefined, now = Date.now()) =>
  status === 'QUEUED' && Boolean(scheduledFor) && Date.parse(scheduledFor!) > now

/** A planned content date far enough ahead to pre-fill the schedule field. */
export const isSchedulableDate = (iso: string | null | undefined, now = Date.now()) =>
  Boolean(iso) && Date.parse(iso!) > now + 5 * 60_000
