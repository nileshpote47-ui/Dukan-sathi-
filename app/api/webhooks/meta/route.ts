import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { safeEqual, sha256Hex } from '@/services/publishing/crypto'
import { env, serverSecret } from '@/services/publishing/env'
import { parseWhatsAppWebhook, verifyHubSignature } from '@/services/publishing/providers/meta-shared'

/*
 * Meta webhooks (WhatsApp Business Account: message statuses and customer STOP replies).
 * GET: verification handshake (hub.verify_token = META_WEBHOOK_VERIFY_TOKEN).
 * POST: trusted only when X-Hub-Signature-256 matches the raw body signed with META_APP_SECRET.
 * Processing is idempotent (hash of each delivery); Meta retries non-200 responses for 7 days.
 */

const MAX_BODY_BYTES = 512_000

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const token = env('META_WEBHOOK_VERIFY_TOKEN')
  if (params.get('hub.mode') === 'subscribe' && token && safeEqual(params.get('hub.verify_token') ?? '', token)) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ ok: false }, { status: 403 })
}

export async function POST(request: Request) {
  const appSecret = env('META_APP_SECRET')
  const secret = serverSecret()
  if (!appSecret || !secret) return NextResponse.json({ ok: false }, { status: 503 })

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 })
  if (!verifyHubSignature(raw, request.headers.get('x-hub-signature-256'), appSecret)) {
    console.warn('[publishing] meta webhook rejected: invalid signature')
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const summaries = parseWhatsAppWebhook(body)
  if (!summaries.length) return NextResponse.json({ ok: true, ignored: true })

  const supabase = await createClient()
  const bodyHash = sha256Hex(raw)
  for (const [index, summary] of summaries.entries()) {
    const { data, error } = await supabase.rpc('publishing_process_whatsapp_webhook', {
      p_secret: secret,
      p_event_hash: sha256Hex(`${bodyHash}:${index}`),
      p_phone_number_id: summary.phoneNumberId,
      p_statuses: summary.statuses as unknown as Json,
      p_optouts: summary.optOuts as unknown as Json,
    })
    if (error) {
      console.error('[publishing] meta webhook failed', { code: error.code })
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    console.info('[publishing] meta webhook', { result: data, statuses: summary.statuses.length, optOuts: summary.optOuts.length })
  }
  return NextResponse.json({ ok: true })
}
