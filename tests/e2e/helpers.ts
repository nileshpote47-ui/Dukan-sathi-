import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'

export const users = {
  a: { email: process.env.E2E_USER_A_EMAIL ?? '', password: process.env.E2E_USER_A_PASSWORD ?? '' },
  b: { email: process.env.E2E_USER_B_EMAIL ?? '', password: process.env.E2E_USER_B_PASSWORD ?? '' },
}

export const hasTestUsers = Boolean(users.a.email && users.a.password && users.b.email && users.b.password)

export async function login(page: Page, user: { email: string; password: string }, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** A Supabase client signed in as a test user: talks to the real API, so RLS applies. */
export async function apiClientFor(user: { email: string; password: string }) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(user)
  expect(error, 'test user can sign in through the API').toBeNull()
  return { client, userId: data.user!.id }
}

/** Fail the test on uncaught page errors or console errors. */
export function trackPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}
