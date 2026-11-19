import type { AccountStatus, Channel, ConnectorId, PublishingErrorCode, SocialProviderId } from '@/lib/config/publishing'

/*
 * Provider-neutral publishing contracts. Application code (actions, runner, pages) only uses
 * these types; each platform lives in services/publishing/providers/<name>.ts.
 */

/** Tokens stored encrypted in social_account_credentials. Never sent to the browser or logged. */
export interface StoredCredentials {
  accessToken: string
  refreshToken?: string
  /** ISO time the access token expires (null = no expiry, e.g. Meta Page tokens). */
  expiresAt?: string | null
  /** WhatsApp two-step verification PIN set when the number was registered. */
  pin?: string
}

/** One account found during authorization (a login can grant several, e.g. a Page and its Instagram). */
export interface ConnectedAccount {
  channel: Channel
  provider: SocialProviderId
  externalId: string
  name: string
  parentId: string | null
  scopes: string[]
  /** Display data only (username, picture URL, phone display number, provider user id). */
  metadata: Record<string, string | number | boolean | null>
  credentials: StoredCredentials
}

export interface PublishTarget {
  accountId: string
  channel: Channel
  externalId: string
  parentId: string | null
  metadata: Record<string, unknown>
}

export interface WhatsAppRecipient {
  contactId: string
  phone: string
}

export interface WhatsAppTemplateParams {
  name: string
  language: string
  /** Values for {{1}}, {{2}}… in the template body. */
  bodyParams: string[]
  /** Template has an IMAGE header: the picture is sent as the header. */
  imageHeader: boolean
}

export interface PublishRequest {
  target: PublishTarget
  credentials: StoredCredentials
  caption: string
  /** Public (signed) URL of the prepared JPEG, when the post has a picture. */
  mediaUrl: string | null
  /** Provider reference from an earlier attempt (e.g. Instagram container id) for a safe retry. */
  previousRef: string | null
  whatsapp?: { template: WhatsAppTemplateParams; recipients: WhatsAppRecipient[] }
  /** Business website/phone for call-to-action buttons (Google Business Profile). */
  business?: { website: string | null; phone: string | null }
  /** Content language (en / mr / hi). */
  language?: string
}

export interface PublishSuccess {
  ok: true
  externalId: string | null
  externalUrl: string | null
  providerRef?: string | null
  metadata?: Record<string, unknown>
  /** WhatsApp: one entry per recipient (wamid null = rejected). */
  messages?: { contactId: string; wamid: string | null; errorCode?: string | null }[]
}

export interface PublishFailure {
  ok: false
  code: PublishingErrorCode
  /** Short technical summary for the history (no tokens, no raw payloads). */
  message: string
  /** Only for temporary problems where nothing was published. */
  retryInSeconds?: number | null
  /** The authorization is no longer usable. */
  accountStatus?: Extract<AccountStatus, 'EXPIRED' | 'REVOKED' | 'ERROR'> | null
  providerRef?: string | null
  messages?: { contactId: string; wamid: string | null; errorCode?: string | null }[]
}

export type PublishResult = PublishSuccess | PublishFailure

export interface WhatsAppTemplate {
  name: string
  language: string
  category: string
  bodyText: string
  bodyParamCount: number
  imageHeader: boolean
}

/** One connection flow (OAuth or embedded signup) and the publishers for its channels. */
export interface Connector {
  id: ConnectorId
  provider: SocialProviderId
  isConfigured(): boolean
  /** Redirect-based OAuth (Meta Login, Google). WhatsApp uses Embedded Signup instead. */
  getAuthorizationUrl?(input: { state: string; redirectUri: string; codeChallenge: string }): string
  handleOAuthCallback?(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<ConnectedAccount[]>
  /** Embedded Signup (WhatsApp): exchange the code returned to the browser. */
  completeEmbeddedSignup?(input: { code: string; wabaId: string; phoneNumberId: string }): Promise<ConnectedAccount[]>
  /** New access token when the stored one is about to expire (Google); null = cannot refresh. */
  refreshCredentials?(credentials: StoredCredentials): Promise<StoredCredentials | null>
  /** Revoke the authorization at the provider on disconnect, where the provider supports it. */
  revoke?(credentials: StoredCredentials): Promise<void>
  publish(request: PublishRequest): Promise<PublishResult>
  listWhatsAppTemplates?(target: PublishTarget, credentials: StoredCredentials): Promise<WhatsAppTemplate[]>
}

export class PublishingProviderError extends Error {
  constructor(
    public readonly code: PublishingErrorCode,
    message: string,
    public readonly accountStatus: PublishFailure['accountStatus'] = null,
    public readonly retryInSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'PublishingProviderError'
  }
}
