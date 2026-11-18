import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

/**
 * Data Access Layer: the only place pages and actions get the current user and
 * their data. Every function verifies the session itself (never trusts the client),
 * and every query runs as that user, so row level security applies.
 * React cache() dedupes calls within one request.
 */

export interface CurrentUser {
  id: string
  email: string | null
}

/** Verified current user, or null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (error || !sub) return null
  return { id: sub, email: typeof data.claims.email === 'string' ? data.claims.email : null }
})

/** Current user; redirects to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export const getProfile = cache(async (): Promise<Tables<'profiles'> | null> => {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
  if (error) throw new Error('Could not load profile')
  return data
})

/** The signed-in owner's business (Phase 1: at most one). */
export const getBusiness = cache(async (): Promise<Tables<'businesses'> | null> => {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('Could not load business')
  return data
})

/** For dashboard pages: a finished business profile, or a redirect to onboarding. */
export async function requireOnboardedBusiness() {
  const [business, profile] = await Promise.all([getBusiness(), getProfile()])
  if (!business || !business.onboarding_completed_at) redirect('/onboarding')
  return { business, profile }
}
