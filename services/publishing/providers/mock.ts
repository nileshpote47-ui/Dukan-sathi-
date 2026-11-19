import 'server-only'
import { randomBytes } from 'node:crypto'
import { CONNECTOR_SCOPES, type ConnectorId } from '@/lib/config/publishing'
import type { ConnectedAccount, Connector, PublishRequest, PublishResult, StoredCredentials, WhatsAppTemplate } from '../types'
import { PublishingProviderError } from '../types'

/*
 * Test provider (PUBLISHING_PROVIDER=mock, never in production). The OAuth "dialog" redirects
 * straight back to the callback; publishing outcomes are chosen by markers in the caption so
 * end-to-end tests can exercise every path without calling a real platform:
 *   [mock:rate_limit] [mock:expired] [mock:revoked] [mock:permission] [mock:reject]
 *   [mock:timeout] [mock:malformed]
 * The prepared picture is really downloaded, so the media pipeline is tested too.
 */

export const MOCK_TEMPLATES: WhatsAppTemplate[] = [
  { name: 'festival_offer', language: 'en', category: 'MARKETING', bodyText: 'Hello! {{1}} at {{2}}. Visit us today.', bodyParamCount: 2, imageHeader: true },
  { name: 'weekly_update', language: 'en', category: 'MARKETING', bodyText: 'This week at our shop: {{1}}', bodyParamCount: 1, imageHeader: false },
]

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`
const credentials = (): StoredCredentials => ({ accessToken: `mock_token_${randomBytes(8).toString('hex')}`, expiresAt: null })

export class MockConnector implements Connector {
  readonly provider = 'mock' as const
  constructor(readonly id: ConnectorId) {}

  isConfigured() {
    return true
  }

  getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    return `${redirectUri}?${new URLSearchParams({ code: 'mock_code', state })}`
  }

  async handleOAuthCallback({ code }: { code: string }): Promise<ConnectedAccount[]> {
    if (code !== 'mock_code') throw new PublishingProviderError('PERMISSION_DENIED', 'Mock login refused')
    const scopes = [...CONNECTOR_SCOPES[this.id]]
    const creds = credentials()
    if (this.id === 'meta') {
      return [
        { channel: 'FACEBOOK', provider: 'mock', externalId: 'mock_page_1', name: 'Mock Shop Page', parentId: null, scopes, metadata: { provider_user_id: 'mock_user_1' }, credentials: creds },
        { channel: 'INSTAGRAM', provider: 'mock', externalId: 'mock_ig_1', name: '@mock_shop', parentId: 'mock_page_1', scopes, metadata: { provider_user_id: 'mock_user_1', username: 'mock_shop' }, credentials: creds },
      ]
    }
    if (this.id === 'youtube') {
      return [{ channel: 'YOUTUBE', provider: 'mock', externalId: 'mock_channel_1', name: 'Mock Shop Channel', parentId: null, scopes, metadata: {}, credentials: creds }]
    }
    return [{ channel: 'GOOGLE_BUSINESS_PROFILE', provider: 'mock', externalId: 'locations/mock_1', name: 'Mock Shop, Pune', parentId: 'accounts/mock_1', scopes, metadata: {}, credentials: creds }]
  }

  async completeEmbeddedSignup({ code, wabaId, phoneNumberId }: { code: string; wabaId: string; phoneNumberId: string }) {
    if (code !== 'mock_code') throw new PublishingProviderError('PERMISSION_DENIED', 'Mock signup refused')
    return [
      {
        channel: 'WHATSAPP' as const,
        provider: 'mock' as const,
        externalId: phoneNumberId,
        name: 'Mock Shop (+91 90000 00000)',
        parentId: wabaId,
        scopes: [...CONNECTOR_SCOPES.whatsapp],
        metadata: { display_phone_number: '+91 90000 00000' },
        credentials: credentials(),
      },
    ]
  }

  async listWhatsAppTemplates() {
    return MOCK_TEMPLATES
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const marker = /\[mock:([a-z_]+)\]/.exec(request.caption)?.[1]
    switch (marker) {
      case 'rate_limit':
        return { ok: false, code: 'RATE_LIMITED', message: 'Mock: rate limited', retryInSeconds: 600 }
      case 'expired':
        return { ok: false, code: 'AUTHORIZATION_EXPIRED', message: 'Mock: token expired', accountStatus: 'EXPIRED' }
      case 'revoked':
        return { ok: false, code: 'AUTHORIZATION_EXPIRED', message: 'Mock: app removed', accountStatus: 'REVOKED' }
      case 'permission':
        return { ok: false, code: 'PERMISSION_DENIED', message: 'Mock: missing permission' }
      case 'reject':
        return { ok: false, code: 'INVALID_CONTENT', message: 'Mock: rejected by the platform' }
      case 'timeout':
        return { ok: false, code: 'UNKNOWN_ERROR', message: 'Mock: timed out, result unknown' }
      case 'malformed':
        return { ok: false, code: 'PROVIDER_ERROR', message: 'Mock: malformed provider response' }
    }

    if (request.mediaUrl) {
      // Fetch the prepared picture like the platform would; Instagram needs a JPEG.
      const res = await fetch(request.mediaUrl, { cache: 'no-store' }).catch(() => null)
      const bytes = res?.ok ? new Uint8Array(await res.arrayBuffer()) : null
      if (!bytes || bytes.length < 4) return { ok: false, code: 'INVALID_MEDIA', message: 'Mock: picture could not be fetched' }
      if (request.target.channel === 'INSTAGRAM' && !(bytes[0] === 0xff && bytes[1] === 0xd8)) {
        return { ok: false, code: 'INVALID_MEDIA', message: 'Mock: Instagram needs a JPEG' }
      }
    }

    if (request.target.channel === 'WHATSAPP') {
      const recipients = request.whatsapp?.recipients ?? []
      const messages = recipients.map((r) => ({
        contactId: r.contactId,
        // Numbers ending in 0000 simulate a recipient WhatsApp refuses.
        wamid: r.phone.endsWith('0000') ? null : `wamid.mock.${randomBytes(8).toString('hex')}`,
        errorCode: r.phone.endsWith('0000') ? '131026' : null,
      }))
      const accepted = messages.filter((m) => m.wamid).length
      if (!accepted) return { ok: false, code: 'PROVIDER_ERROR', message: 'Mock: no message accepted', messages }
      return { ok: true, externalId: null, externalUrl: null, messages, metadata: { recipients: recipients.length, accepted, rejected: recipients.length - accepted, template: request.whatsapp?.template.name } }
    }

    if (request.target.channel === 'YOUTUBE') return { ok: false, code: 'INVALID_MEDIA', message: 'YouTube needs a video. Video export is coming soon.' }

    const postId = id('mock_post')
    return { ok: true, externalId: postId, externalUrl: `https://example.com/mock/${request.target.channel.toLowerCase()}/${postId}`, providerRef: id('mock_ref') }
  }
}
