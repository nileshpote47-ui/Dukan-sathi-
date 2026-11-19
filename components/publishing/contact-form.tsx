'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { addContactAction } from '@/app/dashboard/accounts/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Checkbox, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { OPT_IN_SOURCES } from '@/lib/config/publishing'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { decodeMessage } from '@/lib/validation/fields'
import { contactInputSchema, type ContactInput } from '@/lib/validation/publishing'

/** Add a customer who agreed to receive WhatsApp messages (consent must be confirmed). */
export function ContactForm({ businessName }: { businessName: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactInputSchema),
    defaultValues: { name: '', phone: '', optInSource: 'in_person', consent: false as unknown as true },
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(null)
      const result = await addContactAction(values)
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) form.setError(field as keyof ContactInput, { message })
        return setError(result.error)
      }
      toast.success(t('publishing.contacts.added'))
      form.reset()
      router.refresh()
    }),
  )

  const consentError = errors.consent?.message ? decodeMessage(errors.consent.message) : null

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label={t('publishing.contacts.name')} error={errors.name?.message}>
        <Input autoComplete="off" {...form.register('name')} />
      </FormField>
      <FormField label={t('publishing.contacts.phone')} hint={t('publishing.contacts.phoneHint')} error={errors.phone?.message}>
        <Input inputMode="tel" autoComplete="off" {...form.register('phone')} />
      </FormField>
      <FormField label={t('publishing.contacts.source')} error={errors.optInSource?.message}>
        <Select {...form.register('optInSource')}>
          {OPT_IN_SOURCES.map((source) => (
            <option key={source} value={source}>
              {t(`publishing.contacts.source.${source}` as MessageKey)}
            </option>
          ))}
        </Select>
      </FormField>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <Checkbox className="mt-0.5" aria-invalid={consentError ? true : undefined} {...form.register('consent')} />
        <span>{t('publishing.contacts.consent', { business: businessName })}</span>
      </label>
      {consentError && (
        <p role="alert" className="-mt-2 text-sm text-destructive">
          {t(consentError.key, consentError.values)}
        </p>
      )}
      <ActionError messageKey={error} />
      <Button type="submit" loading={pending}>
        {t('publishing.contacts.add')}
      </Button>
    </form>
  )
}
