import Link from 'next/link'
import { DataTable, Pager, pageParam, textParam } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { BUSINESS_CATEGORIES } from '@/lib/config/categories'
import { FREE_PLAN_SLUG, PAID_PLAN_SLUGS } from '@/lib/config/billing'
import { ADMIN_PAGE_SIZE, adminBusinesses } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatDate, intlLocale } from '@/lib/utils/datetime'

export default async function AdminBusinessesPage({ searchParams }: PageProps<'/admin/businesses'>) {
  const raw = await searchParams
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const search = textParam(raw.q)
  const category = (BUSINESS_CATEGORIES as readonly string[]).includes(String(raw.category)) ? String(raw.category) : undefined
  const plan = [FREE_PLAN_SLUG, ...PAID_PLAN_SLUGS].includes(String(raw.plan)) ? String(raw.plan) : undefined
  const page = pageParam(raw.page)
  const data = await adminBusinesses({ search, category, plan, page })

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('admin.nav.businesses')}</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('admin.search')}</span>
          <input name="q" defaultValue={search} maxLength={80} placeholder={t('admin.searchBusinesses')} className="min-h-11 rounded-xl border border-input bg-card px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('admin.category')}</span>
          <select name="category" defaultValue={category ?? ''} className="min-h-11 rounded-xl border border-input bg-card px-3">
            <option value="">{t('admin.all')}</option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`category.${c}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('admin.plan')}</span>
          <select name="plan" defaultValue={plan ?? ''} className="min-h-11 rounded-xl border border-input bg-card px-3">
            <option value="">{t('admin.all')}</option>
            {[FREE_PLAN_SLUG, ...PAID_PLAN_SLUGS].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold hover:bg-muted">{t('admin.apply')}</button>
      </form>
      <DataTable
        caption={t('admin.nav.businesses')}
        headers={[t('admin.col.business'), t('admin.category'), t('admin.plan'), t('admin.col.content'), t('admin.col.published'), t('admin.col.channels'), t('admin.col.created')]}
        empty={t('admin.empty')}
        rows={data.rows.map((b) => [
          <Link key="n" href={`/admin/businesses/${b.id}`} className="font-semibold underline-offset-4 hover:underline">{b.name}</Link>,
          `${t(`category.${b.category}` as MessageKey)}${b.district ? ` · ${b.district}` : ''}`,
          b.plan,
          b.content,
          b.published,
          b.channels,
          formatDate(b.created_at, locale),
        ])}
      />
      <Pager basePath="/admin/businesses" params={{ q: search, category, plan }} page={page} total={data.total} pageSize={ADMIN_PAGE_SIZE} t={t} />
    </>
  )
}
