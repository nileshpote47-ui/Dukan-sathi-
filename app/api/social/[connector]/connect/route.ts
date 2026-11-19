import { NextResponse } from 'next/server'
import { getBusiness, getCurrentUser } from '@/lib/auth/dal'
import { isConnectorId } from '@/lib/config/publishing'
import { createOAuthState, OAUTH_COOKIE } from '@/services/publishing/connect'
import { isPublishingReady, redirectUriFor, siteUrl } from '@/services/publishing/env'
import { allowRequest } from '@/lib/security/rate-limit'
import { getConnector } from '@/services/publishing/registry'

/*
 * GET /api/social/<connector>/connect — start the platform's authorization (OAuth) for the
 * signed-in owner. The state + PKCE verifier go into a signed httpOnly cookie.
 * WhatsApp connects with Embedded Signup on the accounts page instead.
 */

export async function GET(_request: Request, ctx: RouteContext<'/api/social/[connector]/connect'>) {
  const { connector } = await ctx.params
  const back = (query: string) => NextResponse.redirect(`${siteUrl()}/dashboard/accounts?${query}`)
  if (!isConnectorId(connector) || connector === 'whatsapp') return NextResponse.json({ ok: false }, { status: 404 })

  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/dashboard/accounts`)
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return NextResponse.redirect(`${siteUrl()}/onboarding`)

  const adapter = getConnector(connector)
  if (!isPublishingReady() || !adapter.isConfigured() || !adapter.getAuthorizationUrl) return back('error=not_configured')

  if (!(await allowRequest('social_connect'))) return back('error=rate_limited')

  const { cookie, state, challenge, maxAge } = createOAuthState(connector, user.id)
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
