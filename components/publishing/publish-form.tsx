'use client'

import { ImageOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { loadTemplatesAction, publishContentAction } from '@/app/dashboard/content/[id]/publish/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Checkbox, Input, Radio, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { CHANNEL_RULES, PUBLISHING_LIMITS, canPublishToday, type Channel } from '@/lib/config/publishing'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { countHashtags, fillTemplate, validateDraft } from '@/lib/publishing/compose'
import { cn } from '@/lib/utils/cn'
import { istInputToIso } from '@/lib/utils/datetime'
import { decodeMessage } from '@/lib/validation/fields'
import type { WhatsAppTemplate } from '@/services/publishing/types'
import { ChannelLabel } from './badges'

export interface PublishAccountOption {
  id: string
  channel: Channel
  name: string
}

interface MediaOption {
  id: string
  url: string
  width: number
  height: number
  mimeType: string
  type: string
}

interface Props {
  contentId: string
  accounts: PublishAccountOption[]
  captions: Record<Channel, string>
  media: MediaOption[]
  contacts: { id: string; name: string; phone: string }[]
  publishedAccountIds: string[]
  credits: { remaining: number; limit: number } | null
  defaultSchedule: string
  businessName: string
  whatsappDefaults: string[]
}

export function PublishForm(props: Props) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accounts, media, contacts } = props
  const firstUsable = accounts.find((a) => canPublishToday(a.channel))
  const [accountId, setAccountId] = useState(firstUsable?.id ?? '')
  const account = accounts.find((a) => a.id === accountId) ?? null
  const channel = account?.channel ?? null

  const [captions, setCaptions] = useState(props.captions)
  const [mediaId, setMediaId] = useState<string | null>(media[0]?.id ?? null)
  const [mode, setMode] = useState<'now' | 'schedule'>(props.defaultSchedule ? 'schedule' : 'now')
  const [when, setWhen] = useState(props.defaultSchedule)
  const [confirm, setConfirm] = useState(false)
  const [allowRepeat, setAllowRepeat] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()

  // WhatsApp: approved templates of the selected number, values, recipients.
  const [templatesByAccount, setTemplatesByAccount] = useState<Record<string, { templates?: WhatsAppTemplate[]; error?: MessageKey }>>({})
  const templates = templatesByAccount[accountId]?.templates ?? null
  const templateError = templatesByAccount[accountId]?.error ?? null
  const [templateKey, setTemplateKey] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [recipients, setRecipients] = useState<string[]>([])
  const template = templates?.find((tpl) => `${tpl.name}|${tpl.language}` === templateKey) ?? null
  const needTemplates = channel === 'WHATSAPP' && Boolean(accountId) && !templatesByAccount[accountId]

  useEffect(() => {
    if (!needTemplates) return
    let active = true
    loadTemplatesAction(accountId).then((result) => {
      if (active) setTemplatesByAccount((all) => ({ ...all, [accountId]: result.ok ? { templates: result.templates } : { error: result.error } }))
    })
    return () => {
      active = false
    }
  }, [needTemplates, accountId])

  const chooseTemplate = (key: string) => {
    setTemplateKey(key)
    const tpl = templates?.find((x) => `${x.name}|${x.language}` === key)
    setParams(Array.from({ length: tpl?.bodyParamCount ?? 0 }, (_, i) => props.whatsappDefaults[i]?.slice(0, 200) ?? ''))
  }

  const caption = channel ? captions[channel] : ''
  const selectedMedia = media.find((m) => m.id === mediaId) ?? null
  const usesMedia = channel !== 'WHATSAPP' || Boolean(template?.imageHeader)
  const scheduledIso = mode === 'schedule' && when ? istInputToIso(when) : null
  const alreadyPublished = account ? props.publishedAccountIds.includes(account.id) : false
  const noCredits = props.credits !== null && props.credits.remaining < 1

  const issues = useMemo(
    () =>
      channel
        ? validateDraft({
            channel,
            caption,
            media: usesMedia && selectedMedia ? { width: selectedMedia.width, height: selectedMedia.height, mimeType: selectedMedia.mimeType } : null,
            scheduledFor: mode === 'schedule' ? (scheduledIso ? new Date(scheduledIso) : new Date(NaN)) : null,
            whatsapp:
              channel === 'WHATSAPP'
                ? { templateChosen: Boolean(template), params, paramCount: template?.bodyParamCount ?? 0, recipients: recipients.length, needsImage: Boolean(template?.imageHeader) }
                : null,
          })
        : [],
    [channel, caption, usesMedia, selectedMedia, mode, scheduledIso, template, params, recipients],
  )

  const submit = () => {
    setSubmitted(true)
    setError(null)
    setServerIssues([])
    if (!account || issues.length || !confirm) {
      if (!confirm) setError('publishing.validation.confirm')
      return
    }
    startTransition(async () => {
      const result = await publishContentAction({
        contentId: props.contentId,
        accountId: account.id,
        mediaAssetId: usesMedia ? mediaId : null,
        caption,
        mode,
        scheduledFor: mode === 'schedule' ? when : undefined,
        allowRepeat,
        confirm: true,
        whatsapp: template ? { templateName: template.name, language: template.language, params, contactIds: recipients } : undefined,
      })
      if (!result.ok) {
        setError(result.error)
        setServerIssues(result.issues ?? [])
        return
      }
      const outcomeMessage: Record<string, string> = {
        PUBLISHED: t('publishing.form.published', { channel: t(`publishing.channel.${account.channel}` as MessageKey) }),
        SCHEDULED: t('publishing.form.scheduled'),
        FAILED: t('publishing.form.failed'),
      }
      const text = outcomeMessage[result.outcome] ?? t('publishing.form.queued')
      if (result.outcome === 'FAILED') toast.error(text)
      else toast.success(text)
      router.push(`/dashboard/publishing?job=${result.jobId}`)
    })
  }

  if (!accounts.length) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p>{t('publishing.form.noAccounts')}</p>
        <Link href="/dashboard/accounts" className={buttonVariants({})}>
          {t('publishing.form.manageAccounts')}
        </Link>
      </Card>
    )
  }

  const rules = channel ? CHANNEL_RULES[channel] : null
  const shownIssues = submitted ? issues : issues.filter((i) => i.key === 'publishing.validation.needsVideo' || i.key === 'publishing.validation.aspect' || i.key === 'publishing.validation.captionTooLong')

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <fieldset>
            <legend className="mb-3 text-base font-semibold">{t('publishing.form.account')}</legend>
            <div className="flex flex-col gap-2">
              {accounts.map((a) => {
                const usable = canPublishToday(a.channel)
                return (
                  <label
                    key={a.id}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl border p-3',
                      a.id === accountId ? 'border-primary bg-primary-soft' : 'border-border',
                      !usable && 'opacity-60',
                    )}
                  >
                    <Radio name="account" value={a.id} checked={a.id === accountId} disabled={!usable} onChange={() => setAccountId(a.id)} />
                    <span className="flex min-w-0 flex-col">
                      <ChannelLabel channel={a.channel} t={t} />
                      <span className="text-sm break-words text-muted-foreground">
                        {a.name}
                        {!usable && ` · ${t('publishing.form.needsVideo')}`}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            <Link href="/dashboard/accounts" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
              {t('publishing.form.manageAccounts')}
            </Link>
          </fieldset>
        </Card>

        {channel && channel !== 'WHATSAPP' && rules && (
          <Card>
            <FormField
              label={t('publishing.form.caption')}
              hint={[
                t('publishing.form.captionHint', { n: caption.length, max: rules.maxCaption }),
                rules.maxHashtags !== undefined ? t('publishing.form.hashtags', { n: countHashtags(caption), max: rules.maxHashtags }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <Textarea rows={8} value={caption} maxLength={rules.maxCaption + 500} onChange={(e) => setCaptions((c) => ({ ...c, [channel]: e.target.value }))} />
            </FormField>
          </Card>
        )}

        {channel === 'WHATSAPP' && (
          <Card className="flex flex-col gap-4">
            <p className="rounded-xl bg-primary-soft p-3 text-sm">{t('publishing.wa.policy')}</p>
            {templateError ? (
              <ActionError messageKey={templateError} />
            ) : !templates ? (
              <p className="text-sm text-muted-foreground" role="status">{t('publishing.wa.loading')}</p>
            ) : !templates.length ? (
              <p className="text-sm">{t('publishing.wa.noTemplates')}</p>
            ) : (
              <>
                <FormField label={t('publishing.wa.template')}>
                  <Select value={templateKey} onChange={(e) => chooseTemplate(e.target.value)}>
                    <option value="">{t('publishing.wa.chooseTemplate')}</option>
                    {templates.map((tpl) => (
                      <option key={`${tpl.name}|${tpl.language}`} value={`${tpl.name}|${tpl.language}`}>
                        {tpl.name} ({tpl.language})
                      </option>
                    ))}
                  </Select>
                </FormField>
                {template?.imageHeader && <p className="text-sm text-muted-foreground">{t('publishing.wa.imageHeader')}</p>}
                {params.map((value, i) => (
                  <FormField key={i} label={t('publishing.wa.param', { n: i + 1 })}>
                    <Input value={value} maxLength={200} onChange={(e) => setParams((p) => p.map((v, j) => (j === i ? e.target.value : v)))} />
                  </FormField>
                ))}
              </>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('publishing.wa.recipients')}</legend>
              {!contacts.length ? (
                <p className="text-sm text-muted-foreground">{t('publishing.wa.noContacts')}</p>
              ) : (
                <>
                  <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                    <Checkbox
                      checked={recipients.length === Math.min(contacts.length, PUBLISHING_LIMITS.whatsappMaxRecipients)}
                      onChange={(e) => setRecipients(e.target.checked ? contacts.slice(0, PUBLISHING_LIMITS.whatsappMaxRecipients).map((c) => c.id) : [])}
                    />
                    {t('publishing.wa.selectAll', { n: Math.min(contacts.length, PUBLISHING_LIMITS.whatsappMaxRecipients) })}
                  </label>
                  <ul className="max-h-64 overflow-y-auto">
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <Checkbox
                            checked={recipients.includes(c.id)}
                            onChange={(e) => setRecipients((r) => (e.target.checked ? [...r, c.id] : r.filter((x) => x !== c.id)))}
                          />
                          <span>
                            {c.name} <span className="text-muted-foreground">{c.phone}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{t('publishing.wa.selected', { n: recipients.length, max: PUBLISHING_LIMITS.whatsappMaxRecipients })}</p>
                </>
              )}
              <Link href="/dashboard/accounts/whatsapp" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
                {t('publishing.wa.manageContacts')}
              </Link>
            </fieldset>
          </Card>
        )}

        {channel && usesMedia && (
          <Card>
            <fieldset>
              <legend className="mb-3 text-base font-semibold">{t('publishing.form.picture')}</legend>
              {!media.length ? (
                <div className="flex flex-col items-start gap-2 text-sm">
                  <p className="text-muted-foreground">{t('publishing.form.noMedia')}</p>
                  <Link href={`/dashboard/content/${props.contentId}/poster`} className={buttonVariants({ variant: 'secondary' })}>
                    {t('publishing.form.makePoster')}
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {media.map((m) => (
                    <label key={m.id} className={cn('relative cursor-pointer overflow-hidden rounded-xl border-2', m.id === mediaId ? 'border-primary' : 'border-transparent')}>
                      <Radio name="media" className="sr-only" checked={m.id === mediaId} onChange={() => setMediaId(m.id)} aria-label={`${m.type} ${m.width}×${m.height}`} />
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={m.url} alt="" loading="lazy" className="h-28 w-full bg-muted object-contain" />
                    </label>
                  ))}
                  {CHANNEL_RULES[channel].media !== 'image' && (
                    <label className={cn('flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 bg-muted text-xs', mediaId === null ? 'border-primary' : 'border-transparent')}>
                      <Radio name="media" className="sr-only" checked={mediaId === null} onChange={() => setMediaId(null)} />
                      <ImageOff aria-hidden className="size-5" />
                      {t('publishing.form.noPicture')}
                    </label>
                  )}
                </div>
              )}
            </fieldset>
          </Card>
        )}

        {channel && (
          <Card>
            <fieldset>
              <legend className="mb-3 text-base font-semibold">{t('publishing.form.when')}</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['now', 'schedule'] as const).map((value) => (
                  <label key={value} className={cn('flex min-h-11 flex-1 items-center gap-3 rounded-xl border p-3', mode === value ? 'border-primary bg-primary-soft' : 'border-border')}>
                    <Radio name="mode" checked={mode === value} onChange={() => setMode(value)} />
                    {t(value === 'now' ? 'publishing.form.now' : 'publishing.form.schedule')}
                  </label>
                ))}
              </div>
              {mode === 'schedule' && (
                <FormField label={t('publishing.form.dateTime')} className="mt-3">
                  <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </FormField>
              )}
            </fieldset>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        {channel && account && (
          <Card aria-label={t('publishing.form.preview')}>
            <CardTitle className="mb-3 text-base">{t('publishing.form.preview')}</CardTitle>
            <div className={cn('overflow-hidden rounded-2xl border border-border', channel === 'WHATSAPP' && 'bg-success-soft p-3')}>
              {channel !== 'WHATSAPP' && (
                <div className="flex items-center gap-2 border-b border-border p-3">
                  <ChannelLabel channel={channel} t={t} />
                  <span className="truncate text-sm text-muted-foreground">{account.name}</span>
                </div>
              )}
              <div className={cn(channel === 'WHATSAPP' && 'max-w-[85%] overflow-hidden rounded-xl bg-card shadow-sm')}>
                {usesMedia && selectedMedia && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={selectedMedia.url} alt="" className="w-full bg-muted" />
                )}
                <p className="p-3 text-sm break-words whitespace-pre-line">
                  {channel === 'WHATSAPP' ? (template ? fillTemplate(template.bodyText, params) : '…') : caption || '…'}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          {props.credits && (
            <p className={cn('text-sm', noCredits ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
              {noCredits ? t('publishing.form.noCredits') : t('publishing.form.credits', { n: props.credits.remaining, limit: props.credits.limit })}
            </p>
          )}
          {shownIssues.length > 0 && (
            <div role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
              <p className="font-semibold">{t('publishing.form.fixIssues')}</p>
              <ul className="mt-1 list-inside list-disc">
                {shownIssues.map((issue) => (
                  <li key={issue.key}>{t(issue.key, issue.values)}</li>
                ))}
              </ul>
            </div>
          )}
          {serverIssues.length > 0 && (
            <ul role="alert" className="list-inside list-disc rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
              {serverIssues.map((encoded) => {
                const decoded = decodeMessage(encoded)
                return <li key={encoded}>{t(decoded.key, decoded.values)}</li>
              })}
            </ul>
          )}
          {alreadyPublished && (
            <div className="rounded-xl bg-accent-soft p-3 text-sm">
              <p>{t('publishing.form.alreadyPublished')}</p>
              <label className="mt-2 flex min-h-11 items-center gap-3 font-medium">
                <Checkbox checked={allowRepeat} onChange={(e) => setAllowRepeat(e.target.checked)} />
                {t('publishing.form.allowRepeat')}
              </label>
            </div>
          )}
          {account && (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span>{t('publishing.form.confirm', { account: `${t(`publishing.channel.${account.channel}` as MessageKey)} (${account.name})` })}</span>
            </label>
          )}
          <ActionError messageKey={error} />
          <Button onClick={submit} loading={pending} disabled={!account || noCredits || (alreadyPublished && !allowRepeat)} size="lg">
            {mode === 'schedule' ? t('publishing.form.submitSchedule') : channel === 'WHATSAPP' ? t('publishing.form.sendNow') : t('publishing.form.submitNow')}
          </Button>
        </Card>
      </div>
    </div>
  )
}
