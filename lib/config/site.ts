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
  // Health check for uptime monitoring (no user data).
  '/api/health',
  // Search engine files.
  '/robots.txt',
  '/sitemap.xml',
  // Payment provider webhooks: called by the provider (no session); verified by signature.
  '/api/billing/webhooks',
  // Publishing scheduler (pg_cron, server secret) and Meta webhooks (app-secret signature).
  '/api/publishing/run',
  '/api/webhooks',
] as const

/** Signed-in users visiting these are sent to the dashboard. */
export const AUTH_ROUTES = ['/login', '/signup'] as const

/** The app's public origin (no trailing slash), for canonical URLs, robots and the sitemap. */
export function publicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

/** Public pages listed in the sitemap. Dashboard, onboarding, admin and API routes are not indexed. */
export const SITEMAP_ROUTES = ['/', '/pricing', '/signup', '/login'] as const
