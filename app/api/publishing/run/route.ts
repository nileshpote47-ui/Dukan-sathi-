import { NextResponse } from 'next/server'
import { PUBLISHING_LIMITS } from '@/lib/config/publishing'
import { safeEqual } from '@/services/publishing/crypto'
import { serverSecret } from '@/services/publishing/env'
import { runDueJobs } from '@/services/publishing/runner'
import { log } from '@/lib/observability/log'

/*
 * POST /api/publishing/run — the scheduler. Supabase pg_cron calls it (through pg_net) only when
 * a job is due, with "Authorization: Bearer <publishing server secret>". The database checks
 * the secret again on every call, so a guessed request cannot publish anything.
 */

export const maxDuration = 120

export async function POST(request: Request) {
  const secret = serverSecret()
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !header.startsWith('Bearer ') || !safeEqual(header.slice(7), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const result = await runDueJobs(PUBLISHING_LIMITS.runnerBatch)
    if (result.claimed) log.info('[publishing] runner', result)
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
