import type { Metadata } from 'next'
import { AuthForm } from '@/components/forms/auth-form'
import { safeNextPath } from '@/lib/validation/auth'

export const metadata: Metadata = { title: 'Log in' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  const target = safeNextPath(typeof next === 'string' ? next : undefined, '')
  return <AuthForm mode="login" next={target || undefined} />
}
