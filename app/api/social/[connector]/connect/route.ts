import { NextResponse } from 'next/server'
import { getBusiness, getCurrentUser } from '@/lib/auth/dal'
import { CONNECTOR_CHANNELS, isChannel, isConnectorId } from '@/lib/config/publishing'
import { allowedChannels, freeSlots } from '@/lib/billing/channels'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import { createOAuthState, OAUTH_COOKIE } from '@/services/publishing/connect'
import { isPublishingReady, redirectUriFor, siteUrl } from '@/services/publishing/env'
import { allowRequest } from '@/lib/security/rate-limit'
import { getConnector } from '@/services/publishing/registry'

/*
 * GET /api/social/<connector>/connect — start the platform's authorization (OAuth) for the
 * signed-in owner. The state + PKCE verifier go into a signed httpOnly cookie.
 * WhatsApp connects with Embedded Signup on the accounts page instead.
 */

export async function GET(request: Request, ctx: RouteContext<'/api/social/[connector]/connect'>) {
  const { connector } = await ctx.params
  const back = (query: string) => NextResponse.redirect(`${siteUrl()}/dashboard/accounts?${query}`)
  if (!isConnectorId(connector) || connector === 'whatsapp') return NextResponse.json({ ok: false }, { status: 404 })

  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/dashboard/accounts`)
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return NextResponse.redirect(`${siteUrl()}/onboarding`)

  const adapter = getConnector(connector)
  if (!isPublishingReady() || !adapter.isConfigured() || !adapter.getAuthorizationUrl) return back('error=not_configured')

  // Plan rules (plan data): which channels, and how many accounts may be connected.
  const [{ currentPlan }, existing] = await Promise.all([getBillingOverview(), listSocialAccounts()])
  const allowed = allowedChannels(currentPlan).filter((c) => (CONNECTOR_CHANNELS[connector] as readonly string[]).includes(c))
  if (!allowed.length) return back('error=plan_channel')
  const requested = new URL(request.url).searchParams.get('only')
  const only = isChannel(requested) && allowed.includes(requested) ? requested : null
  const reconnecting = existing.some((a) => a.status !== 'CONNECTED' && (CONNECTOR_CHANNELS[connector] as readonly string[]).includes(a.channel))
  if (!reconnecting && freeSlots(currentPlan, existing) === 0) return back('error=plan_accounts')
  // With one account allowed, the owner chooses Facebook OR Instagram before the platform's login.
  if (currentPlan.max_connected_accounts === 1 && allowed.length > 1 && !only && !reconnecting) return back('error=choose_one')

  if (!(await allowRequest('social_connect'))) return back('error=rate_limited')

  const { cookie, state, challenge, maxAge } = createOAuthState(connector, user.id, undefined, only)
  const url = adapter.getAuthorizationUrl({ state, redirectUri: redirectUriFor(connector), codeChallenge: challenge })
  const response = NextResponse.redirect(url)
  response.cookies.set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: siteUrl().startsWith('https://'),
    sameSite: 'lax',
    path: '/api/social',
    maxAge,
  })
  return response
}
