import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Translate } from '@/lib/i18n'

/* Small server-only building blocks for the admin pages (tables, counts, pagination, search). */

export function KeyCounts({ title, counts, empty, label = (k) => k }: { title: string; counts: Record<string, number>; empty: string; label?: (key: string) => string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={title}>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{label(k)}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export function DataTable({ caption, headers, rows, empty }: { caption: string; headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground">
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-border align-top">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pager({ basePath, params, page, total, pageSize, t }: { basePath: string; params: Record<string, string | undefined>; page: number; total: number; pageSize: number; t: Translate }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][])
    return `${basePath}?${q}`
  }
  return (
    <nav aria-label={t('admin.pagination')} className="mt-4 flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{t('admin.pageOf', { page, pages, total })}</span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted">
            {t('common.back')}
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 hover:bg-muted">
            {t('common.next')}
          </Link>
        )}
      </span>
    </nav>
  )
}

export function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4" role="group" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

export const pageParam = (v: unknown) => Math.max(1, Math.min(10_000, Number(v) || 1))
export const textParam = (v: unknown, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
