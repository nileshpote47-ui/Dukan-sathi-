import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env'
import type { StoredCredentials } from './types'

/*
 * Provider tokens are encrypted on the server with AES-256-GCM before they reach the database.
 * The key (SOCIAL_TOKEN_ENCRYPTION_KEY) exists only in the server environment, so even a
 * database leak does not reveal usable tokens. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */

const VERSION = 'v1'

function key(): Buffer {
  const raw = env('SOCIAL_TOKEN_ENCRYPTION_KEY')
  if (!raw) throw new Error('Token encryption key is not configured')
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.length !== 32) throw new Error('Token encryption key must be 32 bytes (base64)')
  return bytes
}

export function encryptCredentials(credentials: StoredCredentials, keyOverride?: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyOverride ?? key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptCredentials(value: string, keyOverride?: Buffer): StoredCredentials {
  const [version, iv, tag, body] = value.split('.')
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unknown credential format')
  const decipher = createDecipheriv('aes-256-gcm', keyOverride ?? key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const json = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(json) as StoredCredentials
  if (typeof parsed.accessToken !== 'string') throw new Error('Invalid credentials')
  return parsed
}

/** Constant-time comparison of two strings (secrets, signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb) && a.length === b.length
}

export const hmacSha256Hex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex')
export const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** OAuth PKCE (RFC 7636) and CSRF state. */
export function newPkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url')
