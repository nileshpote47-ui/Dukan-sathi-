import { createHmac, timingSafeEqual } from 'node:crypto'

/** HMAC-SHA256 hex digest (Razorpay's signature format). */
export const hmacHex = (message: string, secret: string) => createHmac('sha256', secret).update(message, 'utf8').digest('hex')

/** Constant-time comparison of an expected and a received hex signature. */
export function signatureMatches(expectedHex: string, received: string | null | undefined): boolean {
  if (!received || !/^[0-9a-f]+$/i.test(received)) return false
  const a = Buffer.from(expectedHex, 'hex')
  const b = Buffer.from(received.toLowerCase(), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
