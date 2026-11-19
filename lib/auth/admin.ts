import 'server-only'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from './dal'
import { log } from '@/lib/observability/log'

/*
 * Admin authorization. Admins are listed in public.admin_users (granted with SQL only). The
 * check runs on the server for every admin page and again inside every admin_* database
 * function, which also records the view in admin_audit_logs. Non-admins get a plain 404:
 * the admin area is not advertised.
 */

export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await requireUser()
  if (!user) return false
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_is_admin')
  if (error) {
    log.error('[admin] check', error.code)
    return false
  }
  return data === true
})

export async function requireAdmin() {
  const user = await requireUser()
  if (!(await isAdmin())) notFound()
  return user
}
