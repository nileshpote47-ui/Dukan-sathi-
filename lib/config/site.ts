export const siteConfig = {
  name: 'Dukaan Sathi',
  /** Shown in browser tabs and link previews. */
  description: 'Your daily marketing assistant for your business.',
  /** Business-facing times (greetings, dates) use Indian Standard Time, not server time. */
  timeZone: 'Asia/Kolkata',
} as const

/** Routes that do not require a signed-in user. Everything else does. */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/auth/confirm',
  '/auth/error',
  '/pricing',
  // Payment provider webhooks: called by the provider (no session); verified by signature.
  '/api/billing/webhooks',
  // Publishing scheduler (pg_cron, server secret) and Meta webhooks (app-secret signature).
  '/api/publishing/run',
  '/api/webhooks',
] as const

/** Signed-in users visiting these are sent to the dashboard. */
export const AUTH_ROUTES = ['/login', '/signup'] as const
