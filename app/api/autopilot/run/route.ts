import { NextResponse } from 'next/server'
import { runAutopilot } from '@/lib/autopilot/generator'
import { log } from '@/lib/observability/log'
import { safeEqual } from '@/services/publishing/crypto'
import { serverSecret } from '@/services/publishing/env'

/*
 * POST /api/autopilot/run — the weekly Autopilot generator. Supabase pg_cron calls it (through pg_net) once an
 * hour, only when a Premium shop with Autopilot on has not had this week prepared, with
 * "Authorization: Bearer <publishing server secret>". The database checks the secret again.
 */

export const maxDuration = 300

export async function POST(request: Request) {
  const secret = serverSecret()
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !header.startsWith('Bearer ') || !safeEqual(header.slice(7), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const result = await runAutopilot(await testClock(request))
    if (result.businesses) log.info('[autopilot] run', result)
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/**
 * Automated tests only: a fixed "now" (to plan a whole week) when AUTOPILOT_TEST_CLOCK=1 outside production.
 * Production always uses the real time.
 */
async function testClock(request: Request): Promise<Date | undefined> {
  if (process.env.AUTOPILOT_TEST_CLOCK !== '1' || process.env.VERCEL_ENV === 'production') return undefined
  try {
    const body = (await request.json()) as { now?: unknown }
    const date = typeof body.now === 'string' ? new Date(body.now) : null
    return date && !Number.isNaN(date.getTime()) ? date : undefined
  } catch {
    return undefined
  }
}
