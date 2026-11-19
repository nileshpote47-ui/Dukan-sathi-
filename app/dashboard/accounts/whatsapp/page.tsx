import { ArrowLeft, ShieldCheck, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { ContactActions } from '@/components/publishing/contact-actions'
import { ContactForm } from '@/components/publishing/contact-form'
import { Card, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { listWhatsAppContacts } from '@/lib/data/publishing'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { formatDate, intlLocale } from '@/lib/utils/datetime'

export const metadata: Metadata = { title: 'WhatsApp customers' }

export default async function WhatsAppContactsPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const contacts = await listWhatsAppContacts()

  return (
    <>
      <Link href="/dashboard/accounts" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        {t('publishing.accounts.title')}
      </Link>
      <PageHeader title={t('publishing.contacts.title')} description={t('publishing.contacts.subtitle')} />

      <p className="mb-4 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        {t('publishing.contacts.policy')}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardTitle className="mb-4 text-base">{t('publishing.contacts.add')}</CardTitle>
          <ContactForm businessName={business.business_name} />
        </Card>

        <Card>
          <CardTitle className="mb-4 text-base">{t('publishing.contacts.title')}</CardTitle>
          {contacts.length === 0 ? (
            <EmptyState icon={Users} title={t('publishing.contacts.empty')} />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label={contact.name ?? contact.phone_e164}>
                  <div>
                    <p className={cn('font-semibold', contact.opted_out_at && 'text-muted-foreground line-through')}>{contact.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.phone_e164} ·{' '}
                      {contact.opted_out_at
                        ? t(contact.opted_out_by === 'customer' ? 'publishing.contacts.optedOutCustomer' : 'publishing.contacts.optedOutOwner')
                        : t('publishing.contacts.optedIn', { date: formatDate(contact.opt_in_at, locale) })}{' '}
                      · {t(`publishing.contacts.source.${contact.opt_in_source}` as MessageKey)}
                    </p>
                  </div>
                  <ContactActions contactId={contact.id} optedOut={Boolean(contact.opted_out_at)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
