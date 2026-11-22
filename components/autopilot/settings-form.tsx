'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveAutopilotSettingsAction } from '@/app/dashboard/autopilot/actions'
import { ActionError } from '@/components/billing/action-error'
import { ChannelLabel } from '@/components/publishing/badges'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Checkbox, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { AUTOPILOT_OFFERS_MAX, AUTOPILOT_TIMES } from '@/lib/config/autopilot'
import type { Channel } from '@/lib/config/publishing'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

export interface AutopilotAccount {
  id: string
  channel: Channel
  name: string
}

export function AutopilotSettingsForm({
  initial,
  accounts,
  maxAccounts,
  postsPerWeek,
}: {
  initial: { enabled: boolean; accountIds: string[]; postTime: string; ownerOffers: string }
  accounts: AutopilotAccount[]
  maxAccounts: number
  postsPerWeek: number
}) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [accountIds, setAccountIds] = useState(initial.accountIds.filter((id) => accounts.some((a) => a.id === id)))
  const [postTime, setPostTime] = useState(initial.postTime)
  const [ownerOffers, setOwnerOffers] = useState(initial.ownerOffers)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () =>
    startTransition(async () => {
      setError(null)
      const result = await saveAutopilotSettingsAction({ enabled, accountIds, postTime, ownerOffers })
      if (!result.ok) return setError(result.error)
      toast.success(t(result.message ?? 'autopilot.savedOn'))
      router.refresh()
    })

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t('autopilot.settings')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('autopilot.settingsHint', { n: postsPerWeek })}</p>
        </div>
      </div>

      <label className={cn('flex min-h-11 items-center gap-3 rounded-xl border p-3 font-semibold', enabled ? 'border-primary bg-primary-soft' : 'border-border')}>
        <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('autopilot.turnOn')}
      </label>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t('autopilot.where')}</legend>
        <p className="mb-2 text-xs text-muted-foreground">{t('autopilot.whereHint', { n: maxAccounts })}</p>
        {!accounts.length ? (
          <p className="rounded-xl bg-muted p-3 text-sm">{t('autopilot.noAccounts')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((a) => {
              const on = accountIds.includes(a.id)
              const blocked = !on && accountIds.length >= maxAccounts
              return (
                <label key={a.id} className={cn('flex min-h-11 items-center gap-3 rounded-xl border p-3', on ? 'border-primary bg-primary-soft' : 'border-border', blocked && 'opacity-60')}>
                  <Checkbox
                    checked={on}
                    disabled={blocked}
                    onChange={(e) => setAccountIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                  />
                  <span className="flex min-w-0 flex-col">
                    <ChannelLabel channel={a.channel} t={t} />
                    <span className="text-sm break-words text-muted-foreground">{a.name}</span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t('autopilot.whatsappSoon')}</p>
      </fieldset>

      <FormField label={t('autopilot.time')}>
        <Select value={postTime} onChange={(e) => setPostTime(e.target.value)}>
          {AUTOPILOT_TIMES.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label={t('autopilot.offers')} hint={t('autopilot.offersHint', { n: ownerOffers.length, max: AUTOPILOT_OFFERS_MAX })} optional>
        <Textarea rows={3} maxLength={AUTOPILOT_OFFERS_MAX} value={ownerOffers} onChange={(e) => setOwnerOffers(e.target.value)} placeholder={t('autopilot.offersPlaceholder')} />
      </FormField>

      <ActionError messageKey={error} />
      <Button onClick={save} loading={pending}>
        {t('autopilot.save')}
      </Button>
    </Card>
  )
}
