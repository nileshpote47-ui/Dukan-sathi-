import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { isAdmin } from '@/lib/auth/admin'
import { getProfile, requireOnboardedBusiness, requireUser } from '@/lib/auth/dal'
import { isLanguageCode } from '@/lib/config/languages'
import { getTranslator } from '@/lib/i18n'
import { formatDate, intlLocale } from '@/lib/utils/datetime'
import { SettingsForm } from './settings-form'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const [user, { profile }] = await Promise.all([requireUser(), requireOnboardedBusiness(), getProfile()])
  const t = getTranslator(profile?.preferred_language)
  const admin = await isAdmin()
  const language = profile?.preferred_language && isLanguageCode(profile.preferred_language) ? profile.preferred_language : 'en'

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardTitle>{t('settings.account')}</CardTitle>
          <dl className="mt-4 grid gap-3">
            <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm text-muted-foreground">{t('settings.email')}</dt>
              <dd className="break-words">{user.email}</dd>
            </div>
            {profile && (
              <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
                <dt className="text-sm text-muted-foreground">{t('settings.memberSince')}</dt>
                <dd>{formatDate(profile.created_at, intlLocale(language))}</dd>
              </div>
            )}
          </dl>
        </Card>
        {admin && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-5 text-primary" />
              {t('admin.badge')}
            </CardTitle>
            <Link href="/admin" className={buttonVariants({ variant: 'secondary' })}>
              {t('admin.overview.title')}
            </Link>
          </Card>
        )}
        <Card>
          <CardTitle>{t('settings.preferences')}</CardTitle>
          <div className="mt-4">
            <SettingsForm language={language} productUpdateEmails={profile?.product_update_emails ?? true} />
          </div>
        </Card>
      </div>
    </>
  )
}
