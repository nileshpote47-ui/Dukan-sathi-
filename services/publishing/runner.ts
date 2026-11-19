import 'server-only'
import { isChannel, type PublishingErrorCode } from '@/lib/config/publishing'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { decryptCredentials, encryptCredentials } from './crypto'
import { isMockPublishing, serverSecret } from './env'
import { getPublisher } from './registry'
import type { PublishResult, StoredCredentials, WhatsAppTemplateParams } from './types'
import { PublishingProviderError } from './types'

/*
 * Runs one publishing job. Used both for "Publish now" (the owner's session) and by the
 * scheduler endpoint (no session). The database decides everything that must not be forged:
 *   publishing_begin_attempt   QUEUED → SENDING exactly once + one credit reserved
 *   adapter.publish            the platform's real answer
 *   publishing_complete_attempt PUBLISHED (credit used) | FAILED / limited retry (credit released)
 * Tokens are decrypted only here, in memory, and never logged.
 */

export type RunOutcome = 'PUBLISHED' | 'FAILED' | 'QUEUED' | 'skip'

interface BeginResult {
  result: 'ok' | 'skip' | 'failed'
  error_code?: string
  attempt_id?: string
  job?: { id: string; channel: string; caption: string; owner_id: string; business_id: string; metadata: Record<string, unknown> }
  account?: { id: string; channel: string; provider: string; external_account_id: string; external_parent_id: string | null; metadata: Record<string, unknown> }
  ciphertext?: string
  media_url?: string | null
  payload?: {
    whatsapp?: WhatsAppTemplateParams
    contact_ids?: string[]
    business?: { website: string | null; phone: string | null }
    language?: string
  }
  previous_ref?: string | null
}

const REFRESH_MARGIN_MS = 2 * 60 * 1000

export async function runPublishingJob(jobId: string): Promise<RunOutcome> {
  const secret = serverSecret()
  if (!secret) throw new Error('Publishing is not configured')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('publishing_begin_attempt', { p_secret: secret, p_job_id: jobId })
  if (error) {
    console.error('[publishing] begin failed', { job: jobId, code: error.code })
    throw new Error('Could not start publishing')
  }
  const begin = data as unknown as BeginResult
  if (begin.result === 'skip') return 'skip'
  if (begin.result === 'failed') {
    console.info('[publishing] job not sent', { job: jobId, code: begin.error_code })
    return 'FAILED'
  }

  const attemptId = begin.attempt_id!
  const account = begin.account!
  const job = begin.job!
  const started = Date.now()

  const complete = async (result: PublishResult): Promise<RunOutcome> => {
    const failure = result.ok ? null : result
    const { data: status, error: completeError } = await supabase.rpc('publishing_complete_attempt', {
      p_secret: secret,
      p_attempt_id: attemptId,
      p_success: result.ok,
      p_external_id: result.ok ? result.externalId : null,
      p_external_url: result.ok ? result.externalUrl : null,
      p_error_code: failure?.code ?? null,
      p_error_message: failure?.message ?? null,
      p_retry_in_seconds: failure?.retryInSeconds ?? null,
      p_account_status: failure?.accountStatus ?? null,
      p_provider_ref: result.providerRef ?? null,
      p_messages: (result.messages ?? null) as Json,
      p_metadata: ((result.ok ? result.metadata : null) ?? null) as Json,
    })
    if (completeError) {
      // The job stays SENDING; the scheduler marks it "result unknown" after 10 minutes.
      console.error('[publishing] complete failed', { job: jobId, code: completeError.code })
      throw new Error('Could not record the publishing result')
    }
    console.info('[publishing] attempt', {
      job: jobId,
      channel: account.channel,
      outcome: status,
      error: failure?.code ?? null,
      ms: Date.now() - started,
    })
    return status as RunOutcome
  }

  const fail = (code: PublishingErrorCode, message: string, accountStatus: 'EXPIRED' | 'REVOKED' | 'ERROR' | null = null) =>
    complete({ ok: false, code, message, accountStatus })

  if (!isChannel(account.channel)) return fail('ACCOUNT_NOT_CONNECTED', 'Unknown channel')

  let credentials: StoredCredentials
  try {
    credentials = decryptCredentials(begin.ciphertext!)
  } catch {
    return fail('AUTHORIZATION_EXPIRED', 'Stored authorization could not be read; reconnect the account', 'ERROR')
  }

  let publisher
  try {
    publisher = getPublisher(account.channel, account.provider)
  } catch {
    return fail('ACCOUNT_NOT_CONNECTED', 'This account cannot publish here')
  }

  // Refresh short-lived tokens (Google) before use; Meta Page tokens do not expire.
  if (credentials.expiresAt && Date.parse(credentials.expiresAt) - Date.now() < REFRESH_MARGIN_MS) {
    try {
      const refreshed = publisher.refreshCredentials ? await publisher.refreshCredentials(credentials) : null
      if (!refreshed) return fail('AUTHORIZATION_EXPIRED', 'Authorization expired; reconnect the account', 'EXPIRED')
      credentials = refreshed
      await supabase.rpc('publishing_update_credentials', {
        p_secret: secret,
        p_account_id: account.id,
        p_ciphertext: encryptCredentials(refreshed),
        p_token_expires_at: refreshed.expiresAt ?? null,
      })
    } catch (refreshError) {
      if (refreshError instanceof PublishingProviderError) return fail(refreshError.code, refreshError.message, refreshError.accountStatus ?? null)
      return fail('PROVIDER_ERROR', 'Authorization could not be refreshed')
    }
  }

  const payload = begin.payload ?? {}
  let whatsapp
  if (account.channel === 'WHATSAPP') {
    if (!payload.whatsapp) return fail('INVALID_CONTENT', 'Missing WhatsApp template')
    const { data: recipients } = await supabase.rpc('publishing_whatsapp_recipients', { p_secret: secret, p_job_id: jobId })
    // Customers who opted out after the send was scheduled are skipped.
    if (!recipients?.length) return fail('INVALID_CONTENT', 'No recipient is opted in any more')
    whatsapp = { template: payload.whatsapp, recipients: recipients.map((r) => ({ contactId: r.contact_id, phone: r.phone_e164 })) }
  }

  let result: PublishResult
  try {
    result = await publisher.publish({
      target: {
        accountId: account.id,
        channel: account.channel,
        externalId: account.external_account_id,
        parentId: account.external_parent_id,
        metadata: account.metadata ?? {},
      },
      credentials,
      caption: job.caption,
      mediaUrl: begin.media_url ?? null,
      previousRef: begin.previous_ref ?? null,
      whatsapp,
      business: payload.business,
      language: payload.language,
    })
  } catch (publishError) {
    result =
      publishError instanceof PublishingProviderError
        ? { ok: false, code: publishError.code, message: publishError.message, accountStatus: publishError.accountStatus, retryInSeconds: publishError.retryInSeconds }
        : { ok: false, code: 'UNKNOWN_ERROR', message: 'Unexpected publishing error' }
  }
  return complete(result)
}

/** Scheduler: run the jobs that are due (called by /api/publishing/run). */
export async function runDueJobs(limit: number): Promise<{ claimed: number; outcomes: Record<string, number> }> {
  const secret = serverSecret()
  if (!secret) throw new Error('Publishing is not configured')
  // A test server (mock providers) must never pick up real owners' scheduled posts.
  if (isMockPublishing()) return { claimed: 0, outcomes: { skipped_in_test_mode: 1 } }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('publishing_claim_due', { p_secret: secret, p_limit: limit })
  if (error) {
    console.error('[publishing] claim failed', { code: error.code })
    throw new Error('Could not load due jobs')
  }
  const outcomes: Record<string, number> = {}
  for (const jobId of data ?? []) {
    try {
      const outcome = await runPublishingJob(jobId)
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
    } catch {
      outcomes.error = (outcomes.error ?? 0) + 1
    }
  }
  return { claimed: data?.length ?? 0, outcomes }
}
