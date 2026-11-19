import 'server-only'
import type { BillingProviderId } from '@/lib/config/billing'
import { createClient } from '@/lib/supabase/server'
import { getBillingProvider } from './provider'

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored' | 'invalid_signature' | 'invalid_event' | 'not_configured' | 'failed'

/** HTTP status for each outcome. Non-2xx makes the provider retry (for up to 24 h with Razorpay). */
export const WEBHOOK_HTTP_STATUS: Record<WebhookOutcome, number> = {
  processed: 200,
  duplicate: 200,
  ignored: 200,
  invalid_signature: 401,
  invalid_event: 400,
  not_configured: 503,
  failed: 500,
}

/**
 * Process one provider webhook. The raw body and signature go to the database function
 * billing_process_webhook(), which verifies the HMAC with the secret in Vault, records the
 * event id (idempotency) and applies it. The Node side only pre-checks the signature when a
 * secret is configured here too, and cancels superseded subscriptions after an upgrade.
 */
export async function processBillingWebhook(input: {
  provider: BillingProviderId
  eventId: string | null
  rawBody: string
  signature: string | null
}): Promise<WebhookOutcome> {
  const started = Date.now()
  let provider = null
  try {
    provider = getBillingProvider(input.provider)
  } catch {
    // Not configured on this server: the database check below still decides.
  }
  if (provider && provider.verifyWebhookSignature(input.rawBody, input.signature) === false) {
    console.warn('[billing] webhook rejected', { provider: input.provider, reason: 'invalid_signature' })
    return 'invalid_signature'
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('billing_process_webhook', {
    p_provider: input.provider,
    p_event_id: input.eventId ?? '',
    p_body: input.rawBody,
    p_signature: input.signature ?? '',
  })
  if (error) {
    console.error('[billing] webhook db error', { provider: input.provider, code: error.code })
    return 'failed'
  }
  const result = (data ?? {}) as { result?: string; cancel?: string[]; status?: string; reason?: string; note?: string }
  const outcome = (result.result ?? 'failed') as WebhookOutcome
  console.info('[billing] webhook', { provider: input.provider, outcome, status: result.status, reason: result.reason ?? result.note, ms: Date.now() - started })

  // Upgrade: the new subscription is active; stop billing the old one at the provider now.
  if (outcome === 'processed' && provider && result.cancel?.length) {
    for (const subscriptionId of result.cancel) {
      try {
        await provider.cancelSubscription(subscriptionId, { atCycleEnd: false })
      } catch (cancelError) {
        console.error('[billing] could not cancel superseded subscription', {
          provider: input.provider,
          message: cancelError instanceof Error ? cancelError.message.slice(0, 200) : 'unknown',
        })
      }
    }
  }
  return outcome
}
