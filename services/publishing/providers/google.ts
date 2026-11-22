import 'server-only'
import { CONNECTOR_SCOPES } from '@/lib/config/publishing'
import { env, isBusinessProfileApproved } from '../env'
import { HttpTimeoutError, requestJson, summarize } from '../http'
import type { ConnectedAccount, Connector, PublishFailure, PublishRequest, PublishResult, StoredCredentials } from '../types'
import { PublishingProviderError } from '../types'

/*
 * Google: YouTube and Google Business Profile (official docs: OAuth 2.0 for web server apps
 * with PKCE + offline access, YouTube Data API v3 videos.insert, Business Profile APIs:
 * Account Management, Business Information, v4 accounts.locations.localPosts).
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth web client; redirect URIs
 * <site>/api/social/youtube/callback and <site>/api/social/google_business_profile/callback).
 * Business Profile APIs additionally need Google's API access approval for the project.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

const expiresAt = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null)

/** Google API errors → app error codes. Creating a post is not idempotent, so only 429 is retried. */
export function mapGoogleError(status: number, data: unknown): Omit<PublishFailure, 'ok'> {
  const err = (data as { error?: { message?: string; status?: string } } | null)?.error
  const message = `${status}${err?.status ? ` ${err.status}` : ''}: ${summarize(err?.message ?? 'Google API error', 180)}`
  if (status === 401) return { code: 'AUTHORIZATION_EXPIRED', message, accountStatus: 'EXPIRED', retryInSeconds: null }
  if (status === 403) return { code: 'PERMISSION_DENIED', message, accountStatus: null, retryInSeconds: null }
  if (status === 429) return { code: 'RATE_LIMITED', message, retryInSeconds: 900, accountStatus: null }
  if (status === 400) return { code: 'INVALID_CONTENT', message, retryInSeconds: null, accountStatus: null }
  return { code: 'PROVIDER_ERROR', message, retryInSeconds: null, accountStatus: null }
}

abstract class GoogleConnector implements Connector {
  abstract readonly id: 'youtube' | 'google_business_profile'
  readonly provider = 'google' as const

  protected get config() {
    return { clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET') }
  }

  isConfigured() {
    return Boolean(this.config.clientId && this.config.clientSecret)
  }

  getAuthorizationUrl({ state, redirectUri, codeChallenge }: { state: string; redirectUri: string; codeChallenge: string }) {
    const params = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CONNECTOR_SCOPES[this.id].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  protected async exchange(body: Record<string, string>): Promise<TokenResponse> {
    const res = await requestJson<TokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId!, client_secret: this.config.clientSecret!, ...body }),
    })
    if (!res.ok || !res.data?.access_token) {
      const revoked = res.data?.error === 'invalid_grant'
      throw new PublishingProviderError(revoked ? 'AUTHORIZATION_EXPIRED' : 'PROVIDER_ERROR', `Google token request failed (${res.data?.error ?? res.status})`, revoked ? 'REVOKED' : null)
    }
    return res.data
  }

  protected async tokensFromCode(code: string, redirectUri: string, codeVerifier: string): Promise<StoredCredentials & { scopes: string[] }> {
    const t = await this.exchange({ code, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier })
    const scopes = (t.scope ?? '').split(' ').filter(Boolean)
    const missing = CONNECTOR_SCOPES[this.id].filter((s) => !scopes.includes(s))
    if (missing.length) throw new PublishingProviderError('PERMISSION_DENIED', 'Not all permissions were granted')
    return { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiresAt(t.expires_in), scopes }
  }

  async refreshCredentials(credentials: StoredCredentials): Promise<StoredCredentials | null> {
    if (!credentials.refreshToken) return null
    const t = await this.exchange({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken })
    return { ...credentials, accessToken: t.access_token!, refreshToken: t.refresh_token ?? credentials.refreshToken, expiresAt: expiresAt(t.expires_in) }
  }

  async revoke(credentials: StoredCredentials) {
    const token = credentials.refreshToken ?? credentials.accessToken
    await requestJson('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }).catch(() => null)
  }

  protected async get<T>(url: string, token: string) {
    const res = await requestJson<T>(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const mapped = mapGoogleError(res.status, res.data)
      throw new PublishingProviderError(mapped.code, mapped.message, mapped.accountStatus ?? null)
    }
    return res.data as T
  }

  abstract handleOAuthCallback(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<ConnectedAccount[]>
  abstract publish(request: PublishRequest): Promise<PublishResult>
}

export class YouTubeConnector extends GoogleConnector {
  readonly id = 'youtube' as const

  async handleOAuthCallback({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier: string }) {
    const { scopes, ...credentials } = await this.tokensFromCode(code, redirectUri, codeVerifier)
    const data = await this.get<{ items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[] }>(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      credentials.accessToken,
    )
    return (data.items ?? []).map<ConnectedAccount>((channel) => ({
      channel: 'YOUTUBE',
      provider: 'google',
      externalId: channel.id,
      name: channel.snippet?.title ?? 'YouTube channel',
      parentId: null,
      scopes,
      metadata: { picture: channel.snippet?.thumbnails?.default?.url ?? null },
      credentials,
    }))
  }

  /** videos.insert needs a video file; the app cannot produce one yet (video export is "Coming soon"). */
  async publish(): Promise<PublishResult> {
    return { ok: false, code: 'INVALID_MEDIA', message: 'YouTube needs a video. Video export is coming soon.' }
  }
}

export class BusinessProfileConnector extends GoogleConnector {
  readonly id = 'google_business_profile' as const

  /** OAuth client set AND Google's Business Profile API access granted (see isBusinessProfileApproved). */
  isConfigured() {
    return super.isConfigured() && isBusinessProfileApproved()
  }

  async handleOAuthCallback({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier: string }) {
    const { scopes, ...credentials } = await this.tokensFromCode(code, redirectUri, codeVerifier)
    const accounts = await this.get<{ accounts?: { name: string; accountName?: string }[] }>(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      credentials.accessToken,
    )
    const result: ConnectedAccount[] = []
    for (const account of (accounts.accounts ?? []).slice(0, 5)) {
      const locations = await this.get<{ locations?: { name: string; title?: string }[] }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=100`,
        credentials.accessToken,
      )
      for (const location of locations.locations ?? []) {
        result.push({
          channel: 'GOOGLE_BUSINESS_PROFILE',
          provider: 'google',
          externalId: location.name,
          name: location.title ?? 'Business location',
          parentId: account.name,
          scopes,
          metadata: { account_name: account.accountName ?? null },
          credentials,
        })
      }
    }
    return result
  }

  async publish({ target, credentials, caption, mediaUrl, business, language }: PublishRequest): Promise<PublishResult> {
    if (!target.parentId) return { ok: false, code: 'ACCOUNT_NOT_CONNECTED', message: 'Missing Business Profile account' }
    const locationId = target.externalId.replace(/^locations\//, '')
    const callToAction = business?.website
      ? { actionType: 'LEARN_MORE', url: business.website }
      : business?.phone
        ? { actionType: 'CALL' }
        : undefined
    let res
    try {
      res = await requestJson<{ name?: string; searchUrl?: string; state?: string }>(
        `https://mybusiness.googleapis.com/v4/${target.parentId}/locations/${locationId}/localPosts`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageCode: language ?? 'en',
            summary: caption,
            topicType: 'STANDARD',
            ...(mediaUrl ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: mediaUrl }] } : {}),
            ...(callToAction ? { callToAction } : {}),
          }),
        },
      )
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        return { ok: false, code: 'UNKNOWN_ERROR', message: 'Timed out waiting for Google. Check the profile before retrying.' }
      }
      return { ok: false, code: 'PROVIDER_ERROR', message: 'Google could not be reached', retryInSeconds: 300 }
    }
    if (!res.ok || !res.data?.name) return { ok: false, ...mapGoogleError(res.status, res.data) }
    return {
      ok: true,
      externalId: res.data.name,
      externalUrl: res.data.searchUrl ?? null,
      metadata: { state: res.data.state ?? null },
    }
  }
}
