import 'server-only'
import { PROVIDER_TIMEOUT_MS } from '@/lib/config/publishing'

/*
 * Small JSON-over-HTTPS helper for provider REST APIs. No automatic retries (retries are
 * decided by the publishing runner). Response bodies are returned to the adapter, which maps
 * them to safe error codes; they are never logged in full or shown to users.
 */

export interface HttpResult<T = unknown> {
  status: number
  ok: boolean
  data: T | null
  /** Seconds from a Retry-After header, when present. */
  retryAfter: number | null
}

export class HttpTimeoutError extends Error {
  constructor() {
    super('Provider request timed out')
    this.name = 'HttpTimeoutError'
  }
}

export async function requestJson<T = unknown>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams; timeoutMs?: number } = {},
): Promise<HttpResult<T>> {
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(init.timeoutMs ?? PROVIDER_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new HttpTimeoutError()
    throw new Error('Provider could not be reached')
  }
  const text = await response.text()
  let data: T | null = null
  try {
    data = text ? (JSON.parse(text) as T) : null
  } catch {
    data = null
  }
  const retryAfterHeader = Number(response.headers.get('retry-after'))
  return { status: response.status, ok: response.ok, data, retryAfter: Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : null }
}

/** A short, safe summary of a provider error for the job history (no tokens or payloads). */
export const summarize = (text: unknown, max = 200) =>
  (typeof text === 'string' ? text : 'Provider error').replace(/access_token=[^&\s]+/gi, 'access_token=…').replace(/\s+/g, ' ').slice(0, max)
