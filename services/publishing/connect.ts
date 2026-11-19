import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ConnectorId } from '@/lib/config/publishing'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { encryptCredentials, newPkce, randomToken } from './crypto'
import { serverSecret } from './env'
import type { ConnectedAccount } from './types'

/*
 * OAuth state for account connection. The state, PKCE verifier, user id and expiry travel in an
 * httpOnly cookie signed with the server secret; the callback accepts the code only when the
 * returned state matches, the cookie is valid and unexpired, and the same user is signed in.
 */

export const OAUTH_COOKIE = 'ds_social_oauth'
const TTL_SECONDS = 10 * 60

interface OAuthState {
  connector: ConnectorId
  state: string
  verifier: string
  userId: string
  exp: number
}

const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url')

export function createOAuthState(connector: ConnectorId, userId: string, secret = serverSecret()) {
  if (!secret) throw new Error('Publishing is not configured')
  const pkce = newPkce()
  const payload: OAuthState = { connector, state: randomToken(), verifier: pkce.verifier, userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { cookie: `${body}.${sign(body, secret)}`, state: payload.state, challenge: pkce.challenge, maxAge: TTL_SECONDS }
}

export function readOAuthState(
  cookie: string | undefined,
  expected: { connector: ConnectorId; state: string | null; userId: string },
  secret = serverSecret(),
): OAuthState | null {
  if (!cookie || !secret || !expected.state) return null
  const [body, signature] = cookie.split('.')
  if (!body || !signature) return null
  const good = Buffer.from(sign(body, secret))
  const given = Buffer.from(signature)
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
    if (payload.exp < Date.now() / 1000) return null
    if (payload.connector !== expected.connector || payload.userId !== expected.userId) return null
    const a = Buffer.from(payload.state)
    const b = Buffer.from(expected.state)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return payload
  } catch {
    return null
  }
}

/** Store authorized accounts for the signed-in owner's business (tokens encrypted first). */
export async function saveConnectedAccounts(accounts: ConnectedAccount[]): Promise<number> {
  const secret = serverSecret()
  if (!secret) throw new Error('Publishing is not configured')
  const supabase = await createClient()
  let saved = 0
  for (const account of accounts) {
    const { error } = await supabase.rpc('publishing_connect_account', {
      p_secret: secret,
      p_channel: account.channel,
      p_provider: account.provider,
      p_external_id: account.externalId,
      p_name: account.name,
      p_parent_id: account.parentId,
      p_scopes: account.scopes,
      p_metadata: account.metadata as Json,
      p_ciphertext: encryptCredentials(account.credentials),
      p_token_expires_at: account.credentials.expiresAt ?? null,
    })
    if (error) console.error('[publishing] connect failed', { channel: account.channel, code: error.code })
    else saved++
  }
  return saved
}
