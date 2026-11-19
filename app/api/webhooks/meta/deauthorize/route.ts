import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomToken } from '@/services/publishing/crypto'
import { env, serverSecret, siteUrl } from '@/services/publishing/env'
import { parseSignedRequest } from '@/services/publishing/providers/meta-shared'

/*
 * Meta "Deauthorize callback" and "Data deletion request" (App Dashboard › Facebook Login for
 * Business › Settings). Meta POSTs a signed_request (HMAC-SHA256 with META_APP_SECRET) when a
 * person removes the app. Their connected accounts become REVOKED, stored tokens are deleted
 * and queued posts are cancelled. ?type=deletion answers with the confirmation Meta expects.
 */

export async function POST(request: Request) {
  const appSecret = env('META_APP_SECRET')
  const secret = serverSecret()
  if (!appSecret || !secret) return NextResponse.json({ ok: false }, { status: 503 })

  const form = await request.formData().catch(() => null)
  const signed = form?.get('signed_request')
  const payload = typeof signed === 'string' ? parseSignedRequest(signed, appSecret) : null
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('publishing_revoke_provider_user', {
    p_secret: secret,
    p_provider: 'meta',
    p_provider_user_id: payload.user_id,
  })
  if (error) {
    console.error('[publishing] meta deauthorize failed', { code: error.code })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  console.info('[publishing] meta deauthorize', { accounts: data })

  if (new URL(request.url).searchParams.get('type') === 'deletion') {
    const code = randomToken(12)
    return NextResponse.json({ url: `${siteUrl()}/dashboard/accounts?deletion=${code}`, confirmation_code: code })
  }
  return NextResponse.json({ ok: true })
}
