import { NextResponse } from 'next/server'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/*
 * GET /api/health — lightweight health check for uptime monitors and post-deploy checks.
 * Public, no secrets, no user data: it reads one row of the public price list (the same data
 * the pricing page shows) to prove the database answers. 200 = healthy, 503 = database down.
 */

export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 5000

export async function GET() {
  const started = Date.now()
  let database: 'ok' | 'error' = 'ok'
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('billing_plans').select('slug').limit(1).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error) {
      database = 'error'
      log.error('[health] database check failed', { code: error.code, message: error.message })
    }
  } catch (error) {
    database = 'error'
    log.error('[health] database check failed', error)
  }
  const healthy = database === 'ok'
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: { app: 'ok', database },
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      ms: Date.now() - started,
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
