'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { saveBusinessProfile } from '@/app/dashboard/business/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { businessFormSchema, type BusinessFormInput } from '@/lib/validation/business'
import Link from 'next/link'
import {
  BrandFields,
  CategoryField,
  ContactFields,
  LanguageField,
  LocationFields,
  NameField,
  type FieldBinder,
} from './business-fields'

/** Edit every business detail at once. Used on /dashboard/business/edit. */
export function BusinessForm({ initialValues }: { initialValues: BusinessFormInput }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<MessageKey | null>(null)

  const form = useForm({
    resolver: zodResolver(businessFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })

  const field: FieldBinder = (name) => ({
    registration: form.register(name),
    error: form.formState.errors[name]?.message,
  })

  const onSubmit = form.handleSubmit(
    () => {
      setFormError(null)
      startTransition(async () => {
        const result = await saveBusinessProfile(form.getValues())
        if (result.ok) {
          toast.success(t('business.saved'))
          router.push('/dashboard/business')
          router.refresh()
          return
        }
        for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(name as keyof BusinessFormInput, { message })
        }
        setFormError(result.error)
        toast.error(t(result.error))
      })
    },
    () => setFormError('errors.validation'),
  )

  const section = (title: MessageKey, children: React.ReactNode) => (
    <Card>
      <CardTitle>{t(title)}</CardTitle>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {section(
        'business.section.basic',
        <>
          <NameField field={field} />
          <CategoryField field={field} />
        </>,
      )}
      {section('business.section.contact', <ContactFields field={field} />)}
      {section('business.section.location', <LocationFields field={field} />)}
      {section('business.section.preferences', <LanguageField field={field} />)}
      {section('business.section.brand', <BrandFields field={field} />)}

      <FormError message={formError ? t(formError) : null} />

      {/* Sticky on phones so Save is always reachable above the bottom bar. */}
      <div className="sticky bottom-16 z-20 -mx-4 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Link href="/dashboard/business" className={buttonVariants({ variant: 'secondary', className: 'flex-1 md:flex-none' })}>
          {t('common.cancel')}
        </Link>
        <Button type="submit" loading={pending} className="flex-1 md:flex-none">
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}
