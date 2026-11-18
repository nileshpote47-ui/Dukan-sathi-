'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authErrorMessage } from '@/lib/auth/errors'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, safeNextPath, signupSchema } from '@/lib/validation/auth'
import { validationFailure, type ActionResult } from '@/lib/validation/result'

export type AuthFormState = (ActionResult<{ checkEmail?: string }> & { email?: string }) | null

/** Base URL for links in emails: configured site URL, else the request's own origin. */
async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') })
  if (!parsed.success) return { ...validationFailure(parsed.error), email }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: authErrorMessage(error), email }

  redirect(safeNextPath(formData.get('next')))
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  const parsed = signupSchema.safeParse({
    fullName: formData.get('fullName'),
    email,
    password: formData.get('password'),
  })
  if (!parsed.success) return { ...validationFailure(parsed.error), email }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Display name only. Never used for authorization.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding`,
    },
  })
  if (error) return { ok: false, error: authErrorMessage(error), email }

  // Email confirmation off: the user is signed in straight away.
  if (data.session) redirect('/onboarding')

  // Email confirmation on: ask them to check their inbox. (Supabase returns the same
  // response for existing emails, so this does not reveal who has an account.)
  return { ok: true, data: { checkEmail: parsed.data.email } }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
