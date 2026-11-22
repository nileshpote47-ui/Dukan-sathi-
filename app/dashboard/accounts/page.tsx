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
import { getBillingOverview } from '@/lib/data/billing'
import { allowedChannels, freeSlots, usableAccountIds } from '@/lib/billing/channels'
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

const ERRORS = ['denied', 'state', 'no_accounts', 'failed', 'not_configured', 'rate_limited', 'plan_channel', 'plan_accounts', 'choose_one'] as const

export default async function AccountsPage({ searchParams }: PageProps<'/dashboard/accounts'>) {
  const [{ profile }, raw] = await Promise.all([requireOnboardedBusiness(), searchParams])
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const [accounts, contacts, billing] = await Promise.all([listSocialAccounts(), listWhatsAppContacts(), getBillingOverview()])
  const plan = billing.currentPlan
  const planChannels = allowedChannels(plan)
  const slots = freeSlots(plan, accounts)
  const usable = usableAccountIds(plan, accounts)
  const plansWith = (channels: readonly string[]) =>
    billing.plans.filter((p) => allowedChannels(p).some((c) => channels.includes(c))).map((p) => p.name).join(', ')
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
          const allowedHere = planChannels.filter((c) => (CONNECTOR_CHANNELS[connector] as readonly string[]).includes(c))
          const chooseOne = plan.max_connected_accounts === 1 && allowedHere.length > 1
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
                        {!usable.has(account.id) && (
                          <p className="rounded-lg bg-accent-soft px-2 py-1 text-xs text-accent-foreground">{t('publishing.accounts.notInPlan', { plan: plan.name })}</p>
                        )}
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

              {!allowedHere.length ? (
                <p className="rounded-xl bg-accent-soft p-3 text-sm">
                  {t('publishing.accounts.planOnly', { plans: plansWith(CONNECTOR_CHANNELS[connector]) })}{' '}
                  <Link href="/dashboard/billing" className="font-medium text-primary underline underline-offset-4">
                    {t('publishing.form.seePlans')}
                  </Link>
                </p>
              ) : !configured ? (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t('publishing.accounts.notSetUp')}</p>
              ) : slots === 0 && !needsReconnect ? (
                <p className="rounded-xl bg-accent-soft p-3 text-sm">
                  {t('publishing.accounts.planLimit', { plan: plan.name, n: plan.max_connected_accounts ?? 0 })}{' '}
                  <Link href="/dashboard/billing" className="font-medium text-primary underline underline-offset-4">
                    {t('publishing.form.seePlans')}
                  </Link>
                </p>
              ) : chooseOne && !list.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">{t('publishing.accounts.chooseOne', { plan: plan.name })}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {allowedHere.map((channel) => (
                      <a key={channel} href={`/api/social/${connector}/connect?only=${channel}`} className={buttonVariants({})}>
                        {t(`publishing.channel.${channel}` as MessageKey)}
                      </a>
                    ))}
                  </div>
                </div>
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
