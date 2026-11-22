import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getBusiness, getCurrentUser } from '@/lib/auth/dal'
import { isConnectorId } from '@/lib/config/publishing'
import { acceptNewAccounts } from '@/lib/billing/channels'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import { OAUTH_COOKIE, readOAuthState, saveConnectedAccounts } from '@/services/publishing/connect'
import { redirectUriFor, siteUrl } from '@/services/publishing/env'
import { getConnector } from '@/services/publishing/registry'
import { PublishingProviderError } from '@/services/publishing/types'
import { log } from '@/lib/observability/log'

/*
 * GET /api/social/<connector>/callback — the platform redirects here after the owner approved
 * (or refused). The code is exchanged on the server; tokens are encrypted and stored; the owner
 * returns to the accounts page with a short result code (never provider details).
 */

export async function GET(request: Request, ctx: RouteContext<'/api/social/[connector]/callback'>) {
  const { connector } = await ctx.params
  const params = new URL(request.url).searchParams
  const done = (query: string) => {
    const response = NextResponse.redirect(`${siteUrl()}/dashboard/accounts?${query}`)
    response.cookies.set(OAUTH_COOKIE, '', { path: '/api/social', maxAge: 0 })
    return response
  }
  if (!isConnectorId(connector) || connector === 'whatsapp') return NextResponse.json({ ok: false }, { status: 404 })

  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/dashboard/accounts`)
  const business = await getBusiness()
  if (!business?.onboarding_completed_at) return NextResponse.redirect(`${siteUrl()}/onboarding`)

  const cookieStore = await cookies()
  const oauth = readOAuthState(cookieStore.get(OAUTH_COOKIE)?.value, { connector, state: params.get('state'), userId: user.id })
  if (!oauth) return done('error=state')
  // The owner pressed "Cancel" / refused permissions on the platform.
  if (params.get('error') || !params.get('code')) return done('error=denied')

  try {
    const accounts = await getConnector(connector).handleOAuthCallback!({
      code: params.get('code')!,
      redirectUri: redirectUriFor(connector),
      codeVerifier: oauth.verifier,
    })
    if (!accounts.length) return done('error=no_accounts')
    // Plan rules again on the way back (never trust the start step alone).
    const [{ currentPlan }, existing] = await Promise.all([getBillingOverview(), listSocialAccounts()])
    const accepted = acceptNewAccounts(currentPlan, accounts, existing, oauth.only ?? null)
    if (!accepted.length) return done('error=plan_accounts')
    const saved = await saveConnectedAccounts(accepted)
    if (!saved) return done('error=failed')
    log.info('[publishing] connected', { connector, accounts: saved })
    return done(`connected=${saved}`)
  } catch (error) {
    const code = error instanceof PublishingProviderError ? error.code : 'UNKNOWN_ERROR'
    log.error('[publishing] connect callback failed', { connector, code })
    return done(code === 'PERMISSION_DENIED' ? 'error=denied' : 'error=failed')
  }
}
