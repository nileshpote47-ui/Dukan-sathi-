import Link from 'next/link'
import { DataTable, Pager, pageParam, textParam } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { ADMIN_PAGE_SIZE, adminUsers } from '@/lib/data/admin'
import { getTranslator } from '@/lib/i18n'
import { formatDate, formatDateTime, intlLocale } from '@/lib/utils/datetime'

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  const raw = await searchParams
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const search = textParam(raw.q)
  const page = pageParam(raw.page)
  const data = await adminUsers({ search, page })

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('admin.nav.users')}</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('admin.search')}</span>
          <input name="q" defaultValue={search} maxLength={80} placeholder={t('admin.searchUsers')} className="min-h-11 rounded-xl border border-input bg-card px-3" />
        </label>
        <button className="min-h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted">{t('admin.apply')}</button>
      </form>
      <DataTable
        caption={t('admin.nav.users')}
        headers={[t('admin.col.email'), t('admin.col.business'), t('admin.col.status'), t('admin.col.lastSignIn'), t('admin.col.created')]}
        empty={t('admin.empty')}
        rows={data.rows.map((u) => [
          <Link key="e" href={`/admin/users/${u.id}`} className="font-semibold break-all underline-offset-4 hover:underline">{u.email ?? u.id}</Link>,
          u.business ? <Link key="b" href={`/admin/businesses/${u.business.id}`} className="underline-offset-4 hover:underline">{u.business.name}</Link> : '—',
          [u.confirmed ? t('admin.confirmed') : t('admin.unconfirmed'), u.banned ? t('admin.banned') : null, u.is_admin ? t('admin.badge') : null].filter(Boolean).join(' · '),
          u.last_sign_in_at ? formatDateTime(u.last_sign_in_at, locale) : '—',
          formatDate(u.created_at, locale),
        ])}
      />
      <Pager basePath="/admin/users" params={{ q: search }} page={page} total={data.total} pageSize={ADMIN_PAGE_SIZE} t={t} />
    </>
  )
}
