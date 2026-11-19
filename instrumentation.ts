import type { Instrumentation } from 'next'

/*
 * Error monitoring (Phase 8): every server error Next.js captures (pages, route handlers,
 * Server Actions, proxy) becomes one structured "unhandled" log line in Vercel's runtime
 * logs, with the digest that the error page shows to the user as a reference. No third-party
 * service; no request headers, cookies or bodies are logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import('@/lib/observability/log')
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined
  log.error('[unhandled] server error', {
    digest,
    error,
    method: request.method,
    path: request.path.split('?')[0],
    route: context.routePath,
    type: context.routeType,
  })
}
