'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { login, signup, type AuthFormState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ConfirmationState, FormError } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n/provider'

/** Login and sign-up share one form; mode switches fields and the server action. */
export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const { t } = useI18n()
  const isSignup = mode === 'signup'
  const [state, action, pending] = useActionState<AuthFormState, FormData>(isSignup ? signup : login, null)

  if (state?.ok && state.data?.checkEmail) {
    return (
      <Card>
        <ConfirmationState
          title={t('auth.checkEmailTitle')}
          body={t('auth.checkEmailBody', { email: state.data.checkEmail })}
          action={
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              {t('auth.loginLink')}
            </Link>
          }
        />
      </Card>
    )
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined
  const formError = state && !state.ok && !state.fieldErrors ? t(state.error) : null

  return (
    <Card>
      <h1 className="text-2xl font-bold">{t(isSignup ? 'auth.signupTitle' : 'auth.loginTitle')}</h1>
      <p className="mt-1 text-muted-foreground">{t(isSignup ? 'auth.signupSubtitle' : 'auth.loginSubtitle')}</p>

      <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        {isSignup && (
          <FormField label={t('auth.fullName')} error={fieldErrors?.fullName}>
            <Input name="fullName" autoComplete="name" required maxLength={100} />
          </FormField>
        )}
        <FormField label={t('auth.email')} error={fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={state?.email}
            key={state?.email} // keep what was typed after a failed attempt
          />
        </FormField>
        <FormField
          label={t('auth.password')}
          error={fieldErrors?.password}
          hint={isSignup ? t('auth.passwordHint') : undefined}
        >
          <Input
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? 8 : undefined}
          />
        </FormField>

        <FormError message={formError} />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          {pending
            ? t(isSignup ? 'auth.signingUp' : 'auth.loggingIn')
            : t(isSignup ? 'auth.signupButton' : 'auth.loginButton')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t(isSignup ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t(isSignup ? 'auth.loginLink' : 'auth.signupLink')}
        </Link>
      </p>
    </Card>
  )
}
