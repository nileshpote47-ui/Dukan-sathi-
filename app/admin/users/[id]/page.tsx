import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Tile } from '@/components/admin/ui'
import { getProfile } from '@/lib/auth/dal'
import { adminUser } from '@/lib/data/admin'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatDate, formatDateTime, intlLocale } from '@/lib/utils/datetime'
import { idSchema } from '@/lib/validation/publishing'

export default async function AdminUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()
  const profile = await getProfile()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const u = await adminUser(id)
  if (!u) notFound()

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← {t('admin.nav.users')}</Link>
      <h1 className="text-2xl font-bold break-all">{u.email ?? u.id}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {u.confirmed ? t('admin.confirmed') : t('admin.unconfirmed')}
        {u.banned && ` · ${t('admin.banned')}`}
        {u.is_admin && ` · ${t('admin.badge')}`} · {t('admin.col.created')} {formatDate(u.created_at, locale)} · {t('admin.col.lastSignIn')}{' '}
        {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at, locale) : '—'}
      </p>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('admin.activity.content')} value={u.activity.content} />
        <Tile label={t('admin.activity.content30')} value={u.activity.content_30d} />
        <Tile label={t('admin.activity.published')} value={u.activity.published} />
        <Tile label={t('admin.activity.ai30')} value={u.activity.ai_30d} />
      </section>
      <h2 className="mb-2 font-semibold">{t('admin.nav.businesses')}</h2>
      {u.businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {u.businesses.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/businesses/${b.id}`} className="font-semibold underline-offset-4 hover:underline">{b.name}</Link>{' '}
              <span className="text-sm text-muted-foreground">
                {t(`category.${b.category}` as MessageKey)} · {b.onboarded ? t('admin.onboarded') : t('admin.notOnboarded')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
