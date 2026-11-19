import 'server-only'

/*
 * Server-only publishing configuration (never NEXT_PUBLIC_, never logged):
 *   PUBLISHING_SERVER_SECRET     same value as the Vault secret 'publishing_server_secret'
 *   SOCIAL_TOKEN_ENCRYPTION_KEY  32 random bytes, base64 (AES-256-GCM for stored tokens)
 *   PUBLISHING_PROVIDER          'mock' for tests (refused in production); unset = real providers
 *   META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID, META_WHATSAPP_CONFIG_ID, META_WEBHOOK_VERIFY_TOKEN
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

export const env = (name: string) => process.env[name]?.trim() || undefined

export function serverSecret(): string | null {
  const value = env('PUBLISHING_SERVER_SECRET')
  return value && value.length >= 32 ? value : null
}

/** Mock providers for automated tests. Never in production. */
export function isMockPublishing(): boolean {
  return env('PUBLISHING_PROVIDER') === 'mock' && process.env.VERCEL_ENV !== 'production'
}

/** Publishing can run at all: server secret + encryption key present. */
export function isPublishingReady(): boolean {
  return Boolean(serverSecret() && env('SOCIAL_TOKEN_ENCRYPTION_KEY'))
}

export function siteUrl(): string {
  const configured = env('NEXT_PUBLIC_SITE_URL')
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

export const redirectUriFor = (connector: string) => `${siteUrl()}/api/social/${connector}/callback`
