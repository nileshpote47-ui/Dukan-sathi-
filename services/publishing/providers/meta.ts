import 'server-only'
import { CONNECTOR_SCOPES, META_GRAPH_VERSION } from '@/lib/config/publishing'
import { env } from '../env'
import { HttpTimeoutError, requestJson } from '../http'
import type { ConnectedAccount, Connector, ContentMetricsResult, MetricStatus, PublishRequest, PublishResult, PublishTarget, StoredCredentials } from '../types'
import { PublishingProviderError } from '../types'
import { appSecretProof, graphError, mapGraphError } from './meta-shared'

/*
 * Facebook Pages + Instagram professional accounts through Facebook Login for Business
 * (official docs: Facebook Login manual flow, long-lived tokens, Pages API › Posts,
 * Instagram Platform › Content Publishing). One login grants Page access tokens; a Page's
 * linked Instagram account is published with the same Page token on graph.facebook.com.
 *
 * Env: META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID (Login for Business configuration
 * requesting CONNECTOR_SCOPES.meta).
 */

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

interface PageRow {
  id: string
  name?: string
  access_token?: string
  tasks?: string[]
  picture?: { data?: { url?: string } }
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string }
}

export class MetaConnector implements Connector {
  readonly id = 'meta' as const
  readonly provider = 'meta' as const

  private get config() {
    return { appId: env('META_APP_ID'), appSecret: env('META_APP_SECRET'), configId: env('META_LOGIN_CONFIG_ID') }
  }

  isConfigured() {
    const c = this.config
    return Boolean(c.appId && c.appSecret && c.configId)
  }

  getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const { appId, configId } = this.config
    const params = new URLSearchParams({
      client_id: appId!,
      redirect_uri: redirectUri,
      state,
      config_id: configId!,
      response_type: 'code',
      override_default_response_type: 'true',
    })
    return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`
  }

  private async graph<T>(path: string, token: string, init: { method?: string; params?: Record<string, string> } = {}) {
    const params = new URLSearchParams({ ...init.params, appsecret_proof: appSecretProof(token, this.config.appSecret!) })
    const isGet = (init.method ?? 'GET') === 'GET'
    return requestJson<T>(`${GRAPH}/${path}${isGet ? `?${params}` : ''}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
      body: isGet ? undefined : params,
    })
  }

  async handleOAuthCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const { appId, appSecret } = this.config
    // 1. Code → short-lived user token (server-to-server; the app secret never leaves the server).
    const short = await requestJson<{ access_token?: string }>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId!, client_secret: appSecret!, redirect_uri: redirectUri, code })}`,
    )
    if (!short.ok || !short.data?.access_token) throw new PublishingProviderError('PERMISSION_DENIED', 'Meta login could not be completed')
    // 2. Long-lived user token (~60 days); Page tokens derived from it do not expire.
    const long = await requestJson<{ access_token?: string }>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId!, client_secret: appSecret!, fb_exchange_token: short.data.access_token })}`,
    )
    const userToken = long.data?.access_token ?? short.data.access_token
    const me = await this.graph<{ id?: string }>('me', userToken, { params: { fields: 'id' } })
    const pages = await this.graph<{ data?: PageRow[] }>('me/accounts', userToken, {
      params: { fields: 'id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}', limit: '50' },
    })
    if (!pages.ok) {
      const mapped = mapGraphError(graphError(pages.data), pages.status)
      throw new PublishingProviderError(mapped.code, mapped.message)
    }
    const userId = me.data?.id ?? null
    const accounts: ConnectedAccount[] = []
    for (const page of pages.data?.data ?? []) {
      // Publishing needs the CREATE_CONTENT task on the Page.
      if (!page.access_token || !page.tasks?.includes('CREATE_CONTENT')) continue
      const credentials = { accessToken: page.access_token, expiresAt: null }
      accounts.push({
        channel: 'FACEBOOK',
        provider: 'meta',
        externalId: page.id,
        name: page.name ?? 'Facebook Page',
        parentId: null,
        scopes: [...CONNECTOR_SCOPES.meta],
        metadata: { provider_user_id: userId, picture: page.picture?.data?.url ?? null },
        credentials,
      })
      const ig = page.instagram_business_account
      if (ig?.id) {
        accounts.push({
          channel: 'INSTAGRAM',
          provider: 'meta',
          externalId: ig.id,
          name: ig.username ? `@${ig.username}` : 'Instagram',
          parentId: page.id,
          scopes: [...CONNECTOR_SCOPES.meta],
          metadata: { provider_user_id: userId, username: ig.username ?? null, picture: ig.profile_picture_url ?? null, page_name: page.name ?? null },
          credentials,
        })
      }
    }
    return accounts
  }

  /**
   * Engagement for published posts with the permissions already granted (no insights scopes):
   * Instagram media like_count + comments_count (instagram_basic); Facebook Page post shares,
   * comments and reactions totals (pages_read_engagement). One multi-id Graph call per account
   * (≤ 50 ids). Reach, impressions and views need insights permissions and are not requested.
   */
  async getContentMetrics(target: PublishTarget, credentials: StoredCredentials, externalIds: string[]): Promise<Record<string, ContentMetricsResult>> {
    const ids = [...new Set(externalIds)].slice(0, 50)
    if (!ids.length) return {}
    const instagram = target.channel === 'INSTAGRAM'
    const fields = instagram ? 'like_count,comments_count' : 'shares,comments.summary(true).limit(0),reactions.summary(total_count).limit(0)'
    const all = (status: MetricStatus) => Object.fromEntries(ids.map((id) => [id, { status, metrics: {} }]))
    let res
    try {
      res = await this.graph<Record<string, Record<string, unknown>>>('', credentials.accessToken, { params: { ids: ids.join(','), fields } })
    } catch {
      return all('ERROR')
    }
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      const mapped = mapGraphError(graphError(res.data), res.status)
      const status: MetricStatus =
        mapped.code === 'RATE_LIMITED' ? 'RATE_LIMITED'
        : mapped.code === 'PERMISSION_DENIED' || mapped.code === 'AUTHORIZATION_EXPIRED' ? 'PERMISSION_DENIED'
        : mapped.code === 'INVALID_CONTENT' ? 'NOT_FOUND'
        : 'ERROR'
      return all(status)
    }
    const out: Record<string, ContentMetricsResult> = {}
    for (const id of ids) {
      const row = res.data[id]
      if (!row || typeof row !== 'object') {
        out[id] = { status: 'NOT_FOUND', metrics: {} }
        continue
      }
      out[id] = { status: 'OK', metrics: instagram ? instagramMetrics(row) : facebookMetrics(row) }
    }
    return out
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    try {
      return request.target.channel === 'INSTAGRAM' ? await this.publishInstagram(request) : await this.publishFacebook(request)
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        // The platform may have published anyway: never retried automatically.
        return { ok: false, code: 'UNKNOWN_ERROR', message: 'Timed out waiting for Meta. Check the post before retrying.', retryInSeconds: null }
      }
      if (error instanceof PublishingProviderError) {
        return { ok: false, code: error.code, message: error.message, accountStatus: error.accountStatus, retryInSeconds: error.retryInSeconds }
      }
      return { ok: false, code: 'PROVIDER_ERROR', message: 'Meta could not be reached', retryInSeconds: 300 }
    }
  }

  private fail(data: unknown, status: number, opts: { allowRetry: boolean }): never {
    const mapped = mapGraphError(graphError(data), status)
    throw new PublishingProviderError(mapped.code, mapped.message, mapped.accountStatus ?? null, opts.allowRetry ? (mapped.retryInSeconds ?? null) : null)
  }

  private async publishFacebook({ target, credentials, caption, mediaUrl }: PublishRequest): Promise<PublishResult> {
    const token = credentials.accessToken
    if (mediaUrl) {
      const res = await this.graph<{ id?: string; post_id?: string }>(`${target.externalId}/photos`, token, {
        method: 'POST',
        params: { url: mediaUrl, caption, published: 'true' },
      })
      // A rejected request created nothing; only rate limits are retried automatically.
      if (!res.ok || !res.data?.id) this.fail(res.data, res.status, { allowRetry: mapGraphError(graphError(res.data), res.status).code === 'RATE_LIMITED' })
      const postId = res.data!.post_id ?? res.data!.id!
      return { ok: true, externalId: postId, externalUrl: `https://www.facebook.com/${postId}`, metadata: { photo_id: res.data!.id } }
    }
    const res = await this.graph<{ id?: string }>(`${target.externalId}/feed`, token, { method: 'POST', params: { message: caption } })
    if (!res.ok || !res.data?.id) this.fail(res.data, res.status, { allowRetry: mapGraphError(graphError(res.data), res.status).code === 'RATE_LIMITED' })
    return { ok: true, externalId: res.data!.id!, externalUrl: `https://www.facebook.com/${res.data!.id}` }
  }

  private async containerStatus(containerId: string, token: string) {
    const res = await this.graph<{ status_code?: string }>(containerId, token, { params: { fields: 'status_code' } })
    return res.ok ? (res.data?.status_code ?? null) : null
  }

  private async publishInstagram({ target, credentials, caption, mediaUrl, previousRef }: PublishRequest): Promise<PublishResult> {
    const token = credentials.accessToken
    if (!mediaUrl) throw new PublishingProviderError('INVALID_MEDIA', 'Instagram posts need a picture')
    let containerId: string | null = null

    // A retry first checks the earlier container, so a post is never published twice.
    if (previousRef) {
      const status = await this.containerStatus(previousRef, token)
      if (status === 'PUBLISHED') {
        return { ok: true, externalId: previousRef, externalUrl: null, providerRef: previousRef, metadata: { note: 'published by an earlier attempt' } }
      }
      if (status === 'FINISHED') containerId = previousRef
    }

    if (!containerId) {
      const created = await this.graph<{ id?: string }>(`${target.externalId}/media`, token, {
        method: 'POST',
        params: { image_url: mediaUrl, caption },
      })
      // Creating a container publishes nothing, so temporary errors may be retried.
      if (!created.ok || !created.data?.id) this.fail(created.data, created.status, { allowRetry: true })
      containerId = created.data!.id!
      // Images are usually ready at once; check briefly (docs: poll status_code, at most once a minute for videos).
      for (let i = 0; i < 3; i++) {
        const status = await this.containerStatus(containerId, token)
        if (status === 'FINISHED' || status === null) break
        if (status === 'ERROR' || status === 'EXPIRED') {
          throw new PublishingProviderError('INVALID_MEDIA', `Instagram could not process the picture (${status})`)
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    let published
    try {
      published = await this.graph<{ id?: string }>(`${target.externalId}/media_publish`, token, {
        method: 'POST',
        params: { creation_id: containerId },
      })
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        return { ok: false, code: 'UNKNOWN_ERROR', message: 'Timed out publishing on Instagram. Check the account before retrying.', providerRef: containerId, retryInSeconds: null }
      }
      throw error
    }
    if (!published.ok || !published.data?.id) {
      const mapped = mapGraphError(graphError(published.data), published.status)
      // The container is kept as providerRef: a later retry checks it before publishing again.
      return { ok: false, ...mapped, providerRef: containerId }
    }
    const mediaId = published.data.id
    const link = await this.graph<{ permalink?: string }>(mediaId, token, { params: { fields: 'permalink' } }).catch(() => null)
    return { ok: true, externalId: mediaId, externalUrl: link?.data?.permalink ?? null, providerRef: containerId }
  }
}

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

/** Only numbers the API actually returned (a missing field stays missing — never guessed). */
export function instagramMetrics(row: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  const likes = count(row.like_count)
  const comments = count(row.comments_count)
  if (likes !== null) out.likes = likes
  if (comments !== null) out.comments = comments
  return out
}

export function facebookMetrics(row: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  const total = (edge: unknown) => count((edge as { summary?: { total_count?: unknown } } | undefined)?.summary?.total_count)
  const reactions = total(row.reactions)
  const comments = total(row.comments)
  const shares = count((row.shares as { count?: unknown } | undefined)?.count)
  if (reactions !== null) out.reactions = reactions
  if (comments !== null) out.comments = comments
  if (shares !== null) out.shares = shares
  return out
}
