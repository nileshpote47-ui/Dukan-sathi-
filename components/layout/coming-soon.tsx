import { Clock } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { getTranslator, type MessageKey } from '@/lib/i18n'

/** Placeholder for sections planned in later phases. No fake functionality. */
export async function ComingSoon({ titleKey }: { titleKey: MessageKey }) {
  const { profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <Card>
        <EmptyState
          icon={Clock}
          title={t('comingSoon.title')}
          body={t('comingSoon.body')}
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>
              {t('comingSoon.back')}
            </Link>
          }
        />
      </Card>
    </>
  )
}
