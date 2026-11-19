import { CheckCircle2, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { AccountStatusBadge, ChannelLabel } from '@/components/publishing/badges'
import { DisconnectAccountButton } from '@/components/publishing/disconnect-account-button'
import { WhatsAppSignupButton } from '@/components/publishing/whatsapp-signup-button'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { CONNECTOR_CHANNELS, CONNECTOR_SCOPES, CONNECTORS, META_GRAPH_VERSION, type ConnectorId } from '@/lib/config/publishing'
import { listSocialAccounts, listWhatsAppContacts } from '@/lib/data/publishing'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { formatDate, intlLocale } from '@/lib/utils/datetime'
import { env, isMockPublishing, isPublishingReady } from '@/services/publishing/env'
import { getConnector } from '@/services/publishing/registry'

export const metadata: Metadata = { title: 'Connected accounts' }

const HINTS: Record<ConnectorId, MessageKey> = {
  meta: 'publishing.accounts.metaHint',
  whatsapp: 'publishing.accounts.whatsappHint',
  youtube: 'publishing.accounts.youtubeHint',
  google_business_profile: 'publishing.accounts.gbpHint',
}

const ERRORS = ['denied', 'state', 'no_accounts', 'failed', 'not_configured'] as const

export default async function AccountsPage({ searchParams }: PageProps<'/dashboard/accounts'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const [accounts, contacts] = await Promise.all([listSocialAccounts(), listWhatsAppContacts()])
  const ready = isPublishingReady()
  const mock = isMockPublishing()
  const connected = Number(raw.connected) || 0
  const error = ERRORS.find((e) => e === raw.error)
  const optedIn = contacts.filter((c) => !c.opted_out_at).length

  return (
    <>
      <PageHeader title={t('publishing.accounts.title')} description={t('publishing.accounts.subtitle')} />

      {connected > 0 && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="size-4" />
          {t('publishing.accounts.connected', { n: connected })}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
          {t(`publishing.accounts.error.${error}` as MessageKey)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {CONNECTORS.map((connector) => {
          const configured = ready && getConnector(connector).isConfigured()
          const list = accounts.filter((a) => (CONNECTOR_CHANNELS[connector] as readonly string[]).includes(a.channel))
          const needsReconnect = list.some((a) => a.status !== 'CONNECTED')
          return (
            <Card key={connector} className="flex flex-col gap-4" aria-label={t(`publishing.accounts.${connector}` as MessageKey)}>
              <div>
                <CardTitle className="text-base">{t(`publishing.accounts.${connector}` as MessageKey)}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t(HINTS[connector])}</p>
              </div>

              {list.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {list.map((account) => {
                    const meta = (account.metadata ?? {}) as { page_name?: string }
                    return (
                      <li key={account.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ChannelLabel channel={account.channel} t={t} />
                          <AccountStatusBadge status={account.status} t={t} />
                        </div>
                        <p className="font-semibold break-words">{account.external_account_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.page_name && <>{t('publishing.accounts.linkedPage', { page: meta.page_name })} · </>}
                          {t('publishing.accounts.connectedAt', { date: formatDate(account.connected_at, locale) })}
                        </p>
                        <div>
                          <DisconnectAccountButton accountId={account.id} name={account.external_account_name ?? ''} meta={account.provider === 'meta'} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!configured ? (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t('publishing.accounts.notSetUp')}</p>
              ) : connector === 'whatsapp' ? (
                <WhatsAppSignupButton
                  appId={env('META_APP_ID') ?? null}
                  configId={env('META_WHATSAPP_CONFIG_ID') ?? null}
                  graphVersion={META_GRAPH_VERSION}
                  mock={mock}
                  label={list.length ? (needsReconnect ? t('publishing.accounts.reconnect') : t('publishing.accounts.connectAnother')) : t('publishing.accounts.waConnect')}
                />
              ) : (
                <a href={`/api/social/${connector}/connect`} className={buttonVariants({ variant: list.length && !needsReconnect ? 'secondary' : 'primary' })}>
                  {list.length ? (needsReconnect ? t('publishing.accounts.reconnect') : t('publishing.accounts.connectAnother')) : t('publishing.accounts.connect')}
                </a>
              )}

              {connector === 'whatsapp' && (
                <Link href="/dashboard/accounts/whatsapp" className={buttonVariants({ variant: 'secondary' })}>
                  <Users aria-hidden className="size-4" />
                  {t('publishing.accounts.waContacts', { n: optedIn })}
                </Link>
              )}

              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer py-2 font-medium">{t('publishing.accounts.permissions')}</summary>
                <ul className="list-inside list-disc break-all">
                  {CONNECTOR_SCOPES[connector].map((scope) => (
                    <li key={scope}>{scope.replace('https://www.googleapis.com/auth/', '')}</li>
                  ))}
                </ul>
              </details>
            </Card>
          )
        })}
      </div>
    </>
  )
}
