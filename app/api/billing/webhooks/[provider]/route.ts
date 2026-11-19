import { NextResponse } from 'next/server'
import { BILLING_PROVIDERS, type BillingProviderId } from '@/lib/config/billing'
import { processBillingWebhook, WEBHOOK_HTTP_STATUS } from '@/services/billing/webhook'

/*
 * Payment provider webhooks, e.g. POST /api/billing/webhooks/razorpay.
 * Public (no session): trust comes only from the signature, verified in the database.
 * Responses contain no internal billing details.
 */

const MAX_BODY_BYTES = 256_000

export async function POST(request: Request, ctx: RouteContext<'/api/billing/webhooks/[provider]'>) {
  const { provider } = await ctx.params
  if (!(BILLING_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  // The test provider does not exist in production.
  if (provider === 'mock' && process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 })

  const outcome = await processBillingWebhook({
    provider: provider as BillingProviderId,
    eventId: request.headers.get('x-razorpay-event-id'),
    rawBody,
    signature: request.headers.get('x-razorpay-signature'),
  })
  const status = WEBHOOK_HTTP_STATUS[outcome]
  return NextResponse.json({ ok: status < 300 }, { status })
}
