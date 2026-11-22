import 'server-only'
import { getBusiness, requireUser } from '@/lib/auth/dal'
import { LIMIT_MESSAGES } from '@/lib/config/billing'
import { CHANNEL_CONNECTOR, canPublishToday, isChannel, type Channel } from '@/lib/config/publishing'
import { getContentItem } from '@/lib/data/content'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import { acceptNewAccounts, planAllowsChannel, usableAccountIds } from '@/lib/billing/channels'
import type { MessageKey } from '@/lib/i18n'
import { validateDraft, type ValidationIssue } from '@/lib/publishing/compose'
import { preparePublishingMedia, removePublishingMedia, resignPublishingMedia } from '@/lib/publishing/prepare-media'
import { createClient } from '@/lib/supabase/server'
import { istInputToIso } from '@/lib/utils/datetime'
import { normalizePhone, type ContactInput, type PublishInput } from '@/lib/validation/publishing'
import type { Json } from '@/types/database'
import { saveConnectedAccounts } from '@/services/publishing/connect'
import { decryptCredentials } from '@/services/publishing/crypto'
import { isPublishingReady, serverSecret } from '@/services/publishing/env'
import { getConnector, getPublisher } from '@/services/publishing/registry'
import { runPublishingJob, type RunOutcome } from '@/services/publishing/runner'
import { PublishingProviderError, type StoredCredentials, type WhatsAppTemplate } from '@/services/publishing/types'
import { log } from '@/lib/observability/log'
import { allowRequest } from '@/lib/security/rate-limit'
import { DIRECT_POSTER_KIND } from '@/lib/config/media'

/*
 * Publishing writes for the signed-in owner. Inputs are validated (Zod) by the Server Actions;
 * here ownership is resolved from the session, channel rules and credits are checked, and the
 * database functions make the final decision. Errors are friendly translation keys; details are
 * logged on the server only.
 */

export type PublishServiceResult =
  | { ok: true; results: PublishResult[] }
  | { ok: false; error: MessageKey; issues?: ValidationIssue[] }

const RPC_ERRORS: Record<string, MessageKey> = {
  'publishing:duplicate': 'publishing.error.duplicate',
  'publishing:already_published': 'publishing.error.alreadyPublished',
  'publishing:content_not_ready': 'publishing.error.contentNotReady',
  'publishing:content_not_found': 'errors.contentNotFound',
  'publishing:account_not_found': 'publishing.error.ACCOUNT_NOT_CONNECTED',
  'publishing:account_not_connected': 'publishing.error.ACCOUNT_NOT_CONNECTED',
  'publishing:invalid_schedule': 'publishing.error.SCHEDULING_ERROR',
  'publishing:media_not_found': 'publishing.error.INVALID_MEDIA',
  'publishing:not_cancellable': 'publishing.error.notCancellable',
  'publishing:not_retryable': 'publishing.error.notRetryable',
  'billing:limit_reached': LIMIT_MESSAGES.social_publishing,
}

function rpcError(error: { code?: string; message: string }, what: string): MessageKey {
  const known = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k))
  if (!known) log.error(`[publishing] ${what}`, error.code, error.message.slice(0, 120))
  return known ? RPC_ERRORS[known] : 'errors.saveFailed'
}

async function ownerContext() {
  const user = await requireUser()
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return null
  return { user, business }
}

/** Decrypted credentials of one of the owner's accounts (server memory only). */
export async function accountCredentials(accountId: string): Promise<{ credentials: StoredCredentials; channel: Channel; provider: string; externalId: string; parentId: string | null } | null> {
  const secret = serverSecret()
  if (!secret) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('publishing_get_credentials', { p_secret: secret, p_account_id: accountId })
  const row = data?.[0]
  if (!row || !isChannel(row.channel)) return null
  try {
    return { credentials: decryptCredentials(row.ciphertext), channel: row.channel, provider: row.provider, externalId: row.external_account_id, parentId: row.external_parent_id }
  } catch {
    return null
  }
}

/** Approved WhatsApp marketing templates of a connected number. */
export async function listTemplatesForAccount(accountId: string): Promise<{ ok: true; templates: WhatsAppTemplate[] } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx || !isPublishingReady()) return { ok: false, error: 'publishing.error.notConfigured' }
  const account = await accountCredentials(accountId)
  if (!account || account.channel !== 'WHATSAPP') return { ok: false, error: 'publishing.error.ACCOUNT_NOT_CONNECTED' }
  try {
    const publisher = getPublisher('WHATSAPP', account.provider)
    const templates =
      (await publisher.listWhatsAppTemplates?.(
        { accountId, channel: 'WHATSAPP', externalId: account.externalId, parentId: account.parentId, metadata: {} },
        account.credentials,
      )) ?? []
    return { ok: true, templates }
  } catch (error) {
    if (error instanceof PublishingProviderError) {
      if (error.accountStatus) {
        const supabase = await createClient()
        await supabase.rpc('publishing_mark_account', { p_secret: serverSecret()!, p_account_id: accountId, p_status: error.accountStatus, p_error_code: error.code })
      }
      return { ok: false, error: `publishing.error.${error.code}` as MessageKey }
    }
    return { ok: false, error: 'publishing.error.PROVIDER_ERROR' }
  }
}

/** True for a direct poster whose text the owner has not confirmed yet. */
export function needsReview(metadata: unknown): boolean {
  const m = metadata as { kind?: unknown; reviewed?: unknown } | null
  return m?.kind === DIRECT_POSTER_KIND && m.reviewed !== true
}

type Supabase = Awaited<ReturnType<typeof createClient>>
type Owner = NonNullable<Awaited<ReturnType<typeof ownerContext>>>

/** Everything checked for one account; creating its job has no further decisions to make. */
interface PreparedPost {
  accountId: string
  channel: Channel
  caption: string
  needsMedia: boolean
  template: WhatsAppTemplate | null
  contactIds: string[]
}

/** One account's outcome when a post goes to several accounts at once. */
export interface PublishResult {
  accountId: string
  channel: Channel
  jobId: string | null
  outcome: RunOutcome | 'SCHEDULED' | 'NOT_CREATED'
  error?: MessageKey
}

/**
 * Publish one post to one or more of the owner's accounts (now or scheduled). Every account is checked first
 * (plan limit, connection, channel rules, picture, WhatsApp template and customers); only when all pass is one
 * job created per account, so a mistake never sends to some accounts and not others.
 */
export async function createPublication(input: PublishInput): Promise<PublishServiceResult> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const secret = serverSecret()
  if (!secret || !isPublishingReady()) return { ok: false, error: 'publishing.error.notConfigured' }
  const { user } = ctx
  const supabase = await createClient()

  // Plan limit: accounts per post (plan data) and enough posts left this month.
  const billing = await getBillingOverview()
  const maxAccounts = billing.currentPlan.max_accounts_per_post ?? 1
  if (input.accountIds.length > maxAccounts) {
    return { ok: false, error: 'publishing.error.accountLimit', issues: [{ key: 'publishing.error.accountLimitDetail', values: { n: maxAccounts, plan: billing.currentPlan.name } }] }
  }
  const credits = billing.usage.find((row) => row.feature_key === 'social_publishing')
  if (credits && credits.remaining < input.accountIds.length) return { ok: false, error: LIMIT_MESSAGES.social_publishing }

  const item = await getContentItem(input.contentId)
  if (!item) return { ok: false, error: 'errors.contentNotFound' }
  if (!['READY', 'SCHEDULED', 'PUBLISHED'].includes(item.status)) return { ok: false, error: 'publishing.error.contentNotReady' }

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, channel, provider, status')
    .eq('owner_id', user.id)
    .in('id', input.accountIds)
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]))
  const chosen = input.accountIds.map((id) => byId.get(id))
  if (chosen.some((a) => !a || a.status !== 'CONNECTED' || !isChannel(a.channel))) return { ok: false, error: 'publishing.error.ACCOUNT_NOT_CONNECTED' }
  // Plan rules: allowed channels, and on plans with an account limit only the first connected accounts.
  if (chosen.some((a) => !planAllowsChannel(billing.currentPlan, a!.channel as Channel))) return { ok: false, error: 'publishing.error.planChannel' }
  if (billing.currentPlan.max_connected_accounts != null) {
    const usable = usableAccountIds(billing.currentPlan, await listSocialAccounts())
    if (chosen.some((a) => !usable.has(a!.id))) return { ok: false, error: 'publishing.error.planAccounts' }
  }
  // One WhatsApp number per post (its own template and customers).
  if (chosen.filter((a) => a!.channel === 'WHATSAPP').length > 1) return { ok: false, error: 'publishing.error.oneWhatsApp' }

  let scheduledFor: Date | null = null
  if (input.mode === 'schedule') {
    const iso = input.scheduledFor ? istInputToIso(input.scheduledFor) : null
    if (!iso) return { ok: false, error: 'publishing.error.SCHEDULING_ERROR' }
    scheduledFor = new Date(iso)
  }

  let media: { width: number; height: number; mimeType: string } | null = null
  if (input.mediaAssetId) {
    const { data: asset } = await supabase
      .from('media_assets')
      .select('width, height, mime_type, metadata')
      .eq('owner_id', user.id)
      .eq('id', input.mediaAssetId)
      .eq('status', 'READY')
      .maybeSingle()
    if (!asset?.width || !asset.height || !asset.mime_type) return { ok: false, error: 'publishing.error.INVALID_MEDIA' }
    // An AI-designed poster is published only after the owner confirmed its text, price and offer.
    if (needsReview(asset.metadata)) return { ok: false, error: 'directPoster.reviewFirst' }
    media = { width: asset.width, height: asset.height, mimeType: asset.mime_type }
  }

  const prepared: PreparedPost[] = []
  for (const account of chosen as { id: string; channel: Channel }[]) {
    const result = await preparePost(ctx, supabase, account, input, media, scheduledFor)
    if (!result.ok) return result
    prepared.push(result.post)
  }

  const results: PublishResult[] = []
  for (const post of prepared) results.push(await executePost(ctx, supabase, secret, item, post, input, scheduledFor))
  if (results.every((r) => r.outcome === 'NOT_CREATED')) return { ok: false, error: results[0].error ?? 'errors.saveFailed' }
  return { ok: true, results }
}

async function preparePost(
  ctx: Owner,
  supabase: Supabase,
  account: { id: string; channel: Channel },
  input: PublishInput,
  media: { width: number; height: number; mimeType: string } | null,
  scheduledFor: Date | null,
): Promise<{ ok: true; post: PreparedPost } | { ok: false; error: MessageKey; issues?: ValidationIssue[] }> {
  const { user, business } = ctx
  const channel = account.channel
  if (!canPublishToday(channel)) return { ok: false, error: 'publishing.validation.needsVideo' }

  // WhatsApp: an approved template of this number + opted-in customers of this business only.
  let template: WhatsAppTemplate | null = null
  let contactIds: string[] = []
  if (channel === 'WHATSAPP') {
    if (!input.whatsapp) return { ok: false, error: 'publishing.validation.chooseTemplate' }
    const templates = await listTemplatesForAccount(account.id)
    if (!templates.ok) return { ok: false, error: templates.error }
    template = templates.templates.find((t) => t.name === input.whatsapp!.templateName && t.language === input.whatsapp!.language) ?? null
    if (!template) return { ok: false, error: 'publishing.validation.chooseTemplate' }
    const { data: contacts } = await supabase
      .from('whatsapp_contacts')
      .select('id')
      .eq('owner_id', user.id)
      .eq('business_id', business.id)
      .is('opted_out_at', null)
      .in('id', input.whatsapp.contactIds)
    contactIds = (contacts ?? []).map((c) => c.id)
    if (contactIds.length !== new Set(input.whatsapp.contactIds).size) return { ok: false, error: 'publishing.error.recipientsChanged' }
  }

  const caption = channel === 'WHATSAPP' ? '' : (input.captions[channel] ?? '').trim()
  const issues = validateDraft({
    channel,
    caption,
    media: channel === 'WHATSAPP' && !template?.imageHeader ? null : media,
    scheduledFor,
    whatsapp: template
      ? { templateChosen: true, params: input.whatsapp!.params, paramCount: template.bodyParamCount, recipients: contactIds.length, needsImage: template.imageHeader }
      : null,
  })
  if (issues.length) return { ok: false, error: 'publishing.error.fixIssues', issues }
  const needsMedia = Boolean(input.mediaAssetId) && (channel !== 'WHATSAPP' || Boolean(template?.imageHeader))
  return { ok: true, post: { accountId: account.id, channel, caption, needsMedia, template, contactIds } }
}

async function executePost(
  ctx: Owner,
  supabase: Supabase,
  secret: string,
  item: { id: string; language: string },
  post: PreparedPost,
  input: PublishInput,
  scheduledFor: Date | null,
): Promise<PublishResult> {
  const { user, business } = ctx
  const base = { accountId: post.accountId, channel: post.channel }
  if (!(await allowRequest('social_publishing'))) return { ...base, jobId: null, outcome: 'NOT_CREATED', error: 'errors.rateLimited' }

  // Picture → JPEG in the owner's folder + signed link valid until the post is due (one file per job).
  let prepared = null
  if (post.needsMedia) {
    const result = await preparePublishingMedia({ ownerId: user.id, assetId: input.mediaAssetId!, publishAt: scheduledFor ?? new Date() })
    if (!result.ok) return { ...base, jobId: null, outcome: 'NOT_CREATED', error: result.reason === 'storage' ? 'errors.saveFailed' : 'publishing.error.INVALID_MEDIA' }
    prepared = result.media
  }

  const { data: jobId, error } = await supabase.rpc('publishing_create_job', {
    p_secret: secret,
    p_content_id: item.id,
    p_account_id: post.accountId,
    p_scheduled_for: scheduledFor?.toISOString() ?? null,
    p_caption: post.caption,
    p_media_asset_id: post.needsMedia ? input.mediaAssetId! : null,
    p_media_url: prepared?.url ?? null,
    p_media_path: prepared?.path ?? null,
    p_payload: {
      ...(post.template
        ? { whatsapp: { name: post.template.name, language: post.template.language, bodyParams: input.whatsapp!.params.map((p) => p.trim()), imageHeader: post.template.imageHeader }, contact_ids: post.contactIds }
        : {}),
      business: { website: business.website_url, phone: business.whatsapp_number || business.phone },
      language: item.language,
    } as Json,
    p_metadata: {
      ...(prepared ? { media_path: prepared.path, media_width: prepared.width, media_height: prepared.height } : {}),
      ...(post.template ? { template: post.template.name, recipients: post.contactIds.length } : {}),
    } as Json,
    p_allow_repeat: input.allowRepeat ?? false,
  })
  if (error || !jobId) {
    await removePublishingMedia(prepared?.path, user.id)
    return { ...base, jobId: null, outcome: 'NOT_CREATED', error: error ? rpcError(error, 'create job') : 'errors.saveFailed' }
  }
  log.info('[publishing] job created', { job: jobId, channel: post.channel, mode: input.mode })

  if (input.mode === 'schedule') return { ...base, jobId, outcome: 'SCHEDULED' }
  try {
    return { ...base, jobId, outcome: await runPublishingJob(jobId) }
  } catch {
    // The job exists; the scheduler resolves it (or marks it unknown) — the owner sees its status.
    return { ...base, jobId, outcome: 'QUEUED' }
  }
}

export async function cancelPublication(jobId: string): Promise<{ ok: true } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('publishing_cancel_job', { p_job_id: jobId })
  if (error) return { ok: false, error: rpcError(error, 'cancel') }
  await removePublishingMedia(path, ctx.user.id)
  return { ok: true }
}

export async function retryPublication(jobId: string): Promise<{ ok: true; outcome: RunOutcome } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  const secret = serverSecret()
  if (!ctx || !secret) return { ok: false, error: 'publishing.error.notConfigured' }
  if (!(await allowRequest('social_publishing'))) return { ok: false, error: 'errors.rateLimited' }
  const supabase = await createClient()
  const { data: job } = await supabase.from('publishing_jobs').select('metadata').eq('owner_id', ctx.user.id).eq('id', jobId).maybeSingle()
  if (!job) return { ok: false, error: 'publishing.error.jobNotFound' }
  const mediaPath = (job.metadata as { media_path?: unknown } | null)?.media_path
  // A fresh link for the prepared picture (the old one may have expired).
  const mediaUrl = typeof mediaPath === 'string' ? await resignPublishingMedia(mediaPath, ctx.user.id, new Date()) : null
  const { error } = await supabase.rpc('publishing_retry_job', { p_secret: secret, p_job_id: jobId, p_media_url: mediaUrl })
  if (error) return { ok: false, error: rpcError(error, 'retry') }
  try {
    return { ok: true, outcome: await runPublishingJob(jobId) }
  } catch {
    return { ok: true, outcome: 'QUEUED' }
  }
}

export async function disconnectAccount(accountId: string): Promise<{ ok: true } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const supabase = await createClient()
  // Revoke at the provider where supported (Google); Meta access is removed by the owner in
  // Facebook settings because one login covers several Pages.
  const account = await accountCredentials(accountId)
  if (account && account.provider !== 'mock') {
    const connector = getConnector(CHANNEL_CONNECTOR[account.channel])
    await connector.revoke?.(account.credentials).catch(() => undefined)
  }
  const { error } = await supabase.rpc('publishing_disconnect_account', { p_account_id: accountId })
  if (error) return { ok: false, error: error.message.includes('account_not_found') ? 'publishing.error.ACCOUNT_NOT_CONNECTED' : 'errors.saveFailed' }
  return { ok: true }
}

export async function completeWhatsAppSignup(input: { code: string; wabaId: string; phoneNumberId: string }): Promise<{ ok: true; count: number } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx || !isPublishingReady()) return { ok: false, error: 'publishing.error.notConfigured' }
  const connector = getConnector('whatsapp')
  if (!connector.isConfigured() || !connector.completeEmbeddedSignup) return { ok: false, error: 'publishing.error.notConfigured' }
  if (!(await allowRequest('social_connect'))) return { ok: false, error: 'errors.rateLimited' }
  const [{ currentPlan }, existing] = await Promise.all([getBillingOverview(), listSocialAccounts()])
  if (!planAllowsChannel(currentPlan, 'WHATSAPP')) return { ok: false, error: 'publishing.error.planChannel' }
  try {
    const accounts = acceptNewAccounts(currentPlan, await connector.completeEmbeddedSignup(input), existing)
    if (!accounts.length) return { ok: false, error: 'publishing.error.planAccounts' }
    const count = await saveConnectedAccounts(accounts)
    return count ? { ok: true, count } : { ok: false, error: 'errors.saveFailed' }
  } catch (error) {
    log.error('[publishing] whatsapp signup failed', { code: error instanceof PublishingProviderError ? error.code : 'unknown' })
    return { ok: false, error: 'publishing.accounts.connectFailed' }
  }
}

export async function addWhatsAppContact(input: ContactInput): Promise<{ ok: true } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const phone = normalizePhone(input.phone)
  if (!phone) return { ok: false, error: 'publishing.contacts.invalidPhone' }
  const supabase = await createClient()
  const { error } = await supabase.from('whatsapp_contacts').insert({
    business_id: ctx.business.id,
    owner_id: ctx.user.id,
    phone_e164: phone,
    name: input.name.trim(),
    opt_in_source: input.optInSource,
    opt_in_at: new Date().toISOString(),
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'publishing.contacts.duplicate' }
    log.error('[publishing] add contact', error.code)
    return { ok: false, error: 'errors.saveFailed' }
  }
  return { ok: true }
}

/** The owner records that a customer no longer wants messages (or removes them). */
export async function optOutWhatsAppContact(contactId: string): Promise<{ ok: true } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('whatsapp_contacts')
    .update({ opted_out_at: new Date().toISOString(), opted_out_by: 'owner' })
    .eq('owner_id', ctx.user.id)
    .eq('id', contactId)
    .is('opted_out_at', null)
  return error ? { ok: false, error: 'errors.saveFailed' } : { ok: true }
}

export async function deleteWhatsAppContact(contactId: string): Promise<{ ok: true } | { ok: false; error: MessageKey }> {
  const ctx = await ownerContext()
  if (!ctx) return { ok: false, error: 'errors.saveFailed' }
  const supabase = await createClient()
  const { error } = await supabase.from('whatsapp_contacts').delete().eq('owner_id', ctx.user.id).eq('id', contactId)
  return error ? { ok: false, error: 'errors.saveFailed' } : { ok: true }
}
