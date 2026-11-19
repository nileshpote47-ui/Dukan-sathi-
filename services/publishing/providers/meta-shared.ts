import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PublishFailure } from '../types'

/*
 * Meta (Graph API) helpers shared by the Facebook/Instagram and WhatsApp adapters and the
 * webhook routes. Pure functions, unit-tested.
 */

export interface GraphError {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  is_transient?: boolean
}

export const graphError = (data: unknown): GraphError | null =>
  data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'object'
    ? ((data as { error: GraphError }).error ?? null)
    : null

/**
 * Map a Graph API error to the app's error codes (Graph API error handling reference:
 * 190 = access token problem, 10/200–299 = permissions, 4/17/32/613/80001+ = rate limits,
 * Instagram 9/2207042 = publishing limit, 2207xxx media problems, is_transient = temporary).
 */
export function mapGraphError(error: GraphError | null, status: number): Omit<PublishFailure, 'ok' | 'providerRef' | 'messages'> {
  const code = error?.code ?? 0
  const sub = error?.error_subcode ?? 0
  const message = `${code}${sub ? `/${sub}` : ''}: ${(error?.message ?? `HTTP ${status}`).slice(0, 180)}`
  if (code === 190) {
    // 458 = the user removed the app; others (460 password changed, 463/467 expired) need a new login.
    return { code: 'AUTHORIZATION_EXPIRED', message, accountStatus: sub === 458 ? 'REVOKED' : 'EXPIRED', retryInSeconds: null }
  }
  if (code === 10 || (code >= 200 && code <= 299) || code === 368) {
    return { code: 'PERMISSION_DENIED', message, accountStatus: null, retryInSeconds: null }
  }
  if (code === 9 && sub === 2207042) return { code: 'RATE_LIMITED', message, retryInSeconds: 3600, accountStatus: null }
  if ([4, 17, 32, 613].includes(code) || (code >= 80001 && code <= 80014)) {
    return { code: 'RATE_LIMITED', message, retryInSeconds: 900, accountStatus: null }
  }
  if (sub >= 2207000 && sub < 2208000) return { code: 'INVALID_MEDIA', message, retryInSeconds: null, accountStatus: null }
  if (code === 100) return { code: 'INVALID_CONTENT', message, retryInSeconds: null, accountStatus: null }
  if (error?.is_transient || code === 1 || code === 2 || status >= 500) {
    return { code: 'PROVIDER_ERROR', message, retryInSeconds: 300, accountStatus: null }
  }
  return { code: 'PROVIDER_ERROR', message, retryInSeconds: null, accountStatus: null }
}

/** appsecret_proof: HMAC-SHA256 of the access token with the app secret (Graph API security). */
export const appSecretProof = (accessToken: string, appSecret: string) =>
  createHmac('sha256', appSecret).update(accessToken).digest('hex')

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). */
export function verifyHubSignature(rawBody: string | Buffer, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  const given = Buffer.from(header.slice(7), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Meta signed_request (deauthorize / data deletion callbacks):
 * "<base64url signature>.<base64url payload>", signature = HMAC-SHA256(payload part, app secret).
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id: string; issued_at?: number } | null {
  const [sigPart, payloadPart] = signedRequest.split('.')
  if (!sigPart || !payloadPart) return null
  const expected = createHmac('sha256', appSecret).update(payloadPart).digest()
  const given = Buffer.from(sigPart, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { algorithm?: string; user_id?: unknown; issued_at?: number }
    if (payload.algorithm?.toUpperCase() !== 'HMAC-SHA256' || typeof payload.user_id !== 'string' || !payload.user_id) return null
    return { user_id: payload.user_id, issued_at: payload.issued_at }
  } catch {
    return null
  }
}

/** Opt-out words customers reply with (and the marketing template "Stop promotions" button). */
const OPT_OUT = /^(stop|unsubscribe|stop promotions|बंद|रद्द)\b/i

export interface WhatsAppWebhookSummary {
  phoneNumberId: string
  statuses: { wamid: string; status: string; error_code: string | null }[]
  optOuts: string[]
}

/** Extract message statuses and STOP replies from a WhatsApp Business Account webhook body. */
export function parseWhatsAppWebhook(body: unknown): WhatsAppWebhookSummary[] {
  const result: WhatsAppWebhookSummary[] = []
  if (!body || typeof body !== 'object' || (body as { object?: unknown }).object !== 'whatsapp_business_account') return result
  const entries = Array.isArray((body as { entry?: unknown }).entry) ? (body as { entry: unknown[] }).entry : []
  for (const entry of entries) {
    const changes = Array.isArray((entry as { changes?: unknown }).changes) ? (entry as { changes: unknown[] }).changes : []
    for (const change of changes) {
      const value = (change as { field?: string; value?: Record<string, unknown> }).value
      if ((change as { field?: string }).field !== 'messages' || !value) continue
      const phoneNumberId = String((value.metadata as { phone_number_id?: unknown } | undefined)?.phone_number_id ?? '')
      if (!phoneNumberId) continue
      const summary: WhatsAppWebhookSummary = { phoneNumberId, statuses: [], optOuts: [] }
      for (const s of Array.isArray(value.statuses) ? (value.statuses as Record<string, unknown>[]) : []) {
        if (typeof s.id !== 'string' || typeof s.status !== 'string') continue
        const errors = Array.isArray(s.errors) ? (s.errors as { code?: unknown }[]) : []
        summary.statuses.push({ wamid: s.id, status: s.status, error_code: errors[0]?.code != null ? String(errors[0].code) : null })
      }
      for (const m of Array.isArray(value.messages) ? (value.messages as Record<string, unknown>[]) : []) {
        const text =
          (m.text as { body?: unknown } | undefined)?.body ?? (m.button as { text?: unknown } | undefined)?.text ??
          (m.interactive as { button_reply?: { title?: unknown } } | undefined)?.button_reply?.title
        if (typeof m.from === 'string' && /^[1-9][0-9]{7,14}$/.test(m.from) && typeof text === 'string' && OPT_OUT.test(text.trim())) {
          summary.optOuts.push(`+${m.from}`)
        }
      }
      if (summary.statuses.length || summary.optOuts.length) result.push(summary)
    }
  }
  return result
}
