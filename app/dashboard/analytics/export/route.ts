import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/dal'
import { toCsv } from '@/lib/analytics/csv'
import { resolveRange } from '@/lib/analytics/range'
import { createClient } from '@/lib/supabase/server'

/*
 * GET /dashboard/analytics/export?kind=content|publishing|usage&range=…
 * CSV of the signed-in owner's own data for the selected India-day range (RLS applies; every
 * query also filters by owner). No tokens, no customer phone numbers, no payment details.
 */

const LIMIT = 5000

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const resolved = resolveRange({ preset: params.get('range'), from: params.get('from'), to: params.get('to') })
  if (!resolved.ok || !['content', 'publishing', 'usage'].includes(kind ?? '')) return NextResponse.json({ ok: false }, { status: 400 })
  const { from, to, fromDay, toDay } = resolved.range
  const supabase = await createClient()

  let rows: (string | number | null)[][] = []
  let header: string[] = []
  if (kind === 'content') {
    header = ['id', 'title', 'type', 'status', 'language', 'created_at', 'scheduled_for']
    const { data, error } = await supabase
      .from('content_items')
      .select('id, title, content_type, status, language, created_at, scheduled_for')
      .eq('owner_id', user.id)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at')
      .limit(LIMIT)
    if (error) return NextResponse.json({ ok: false }, { status: 500 })
    rows = (data ?? []).map((r) => [r.id, r.title, r.content_type, r.status, r.language, r.created_at, r.scheduled_for])
  } else if (kind === 'publishing') {
    header = ['id', 'title', 'channel', 'account', 'status', 'mode', 'scheduled_for', 'published_at', 'attempts', 'error_code', 'post_url']
    const { data, error } = await supabase
      .from('publishing_jobs')
      .select('id, title, channel, status, publish_mode, scheduled_for, published_at, attempt_count, error_code, external_url, created_at, account:social_accounts(external_account_name)')
      .eq('owner_id', user.id)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at')
      .limit(LIMIT)
    if (error) return NextResponse.json({ ok: false }, { status: 500 })
    rows = (data ?? []).map((r) => {
      const account = r.account as { external_account_name: string | null } | null
      return [r.id, r.title, r.channel, account?.external_account_name ?? '', r.status, r.publish_mode, r.scheduled_for, r.published_at, r.attempt_count, r.error_code, r.external_url]
    })
  } else {
    header = ['date', 'feature', 'result']
    const { data, error } = await supabase
      .from('usage_ledger')
      .select('created_at, feature_key, state')
      .eq('owner_id', user.id)
      .eq('transaction_type', 'USAGE')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at')
      .limit(LIMIT)
    if (error) return NextResponse.json({ ok: false }, { status: 500 })
    rows = (data ?? []).map((r) => [r.created_at, r.feature_key, r.state === 'COMMITTED' ? 'used' : r.state === 'RELEASED' ? 'failed (not charged)' : 'in progress'])
  }

  return new NextResponse(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dukaan-sathi-${kind}-${fromDay}-to-${toDay}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
