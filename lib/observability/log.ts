/*
 * Structured server logs: one JSON line per event, which Vercel's runtime logs index and
 * filter (level, msg). Every value passes through redact(): fields whose names look like
 * credentials are replaced, bearer tokens and token-like query values are masked, long text
 * is cut. Use for server code only; never pass whole request bodies or provider responses.
 *
 *   log.error('[publishing] connect callback failed', { connector, code })
 */

type Level = 'info' | 'warn' | 'error'

const SENSITIVE_KEY = /token|secret|password|passwd|authorization|cookie|signature|api[_-]?key|ciphertext|verifier|credential/i
const MAX_STRING = 500
const MAX_DEPTH = 4
const MAX_KEYS = 30

function maskString(value: string): string {
  const masked = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/((?:access_token|refresh_token|client_secret|code|token|key)=)[^&\s"']+/gi, '$1[redacted]')
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return maskString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Error) return { name: value.name, message: maskString(value.message) }
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return '[nested]'
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => redact(item, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }
  return String(value)
}

export function formatLogEntry(level: Level, message: string, details: unknown[], now = new Date()): string {
  const entry: Record<string, unknown> = { level, msg: maskString(message), time: now.toISOString() }
  if (details.length === 1) entry.details = redact(details[0])
  else if (details.length > 1) entry.details = details.map((detail) => redact(detail))
  const deployment = process.env.VERCEL_GIT_COMMIT_SHA
  if (deployment) entry.release = deployment.slice(0, 7)
  return JSON.stringify(entry)
}

function emit(level: Level, message: string, details: unknown[]) {
  const line = formatLogEntry(level, message, details)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const log = {
  info: (message: string, ...details: unknown[]) => emit('info', message, details),
  warn: (message: string, ...details: unknown[]) => emit('warn', message, details),
  error: (message: string, ...details: unknown[]) => emit('error', message, details),
}
