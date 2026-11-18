import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/config/site'
import type { Database } from '@/types/database'
import { getSupabaseEnv } from './env'

const matches = (pathname: string, routes: readonly string[]) =>
  routes.some((route) => (route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)))

/**
 * Runs before every page request (see proxy.ts):
 * 1. refreshes the Supabase session and writes updated auth cookies,
 * 2. sends signed-out visitors away from protected pages,
 * 3. sends signed-in users away from the login/signup pages.
 *
 * This is a convenience redirect only. Real protection is in the data layer
 * (lib/auth/dal.ts re-checks the user) and in the database (row level security).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseEnv()

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims()
  const isSignedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const target = request.nextUrl.clone()
    target.pathname = path
    target.search = ''
    for (const [key, value] of Object.entries(params ?? {})) target.searchParams.set(key, value)
    const redirect = NextResponse.redirect(target)
    // Keep any refreshed auth cookies and no-cache headers on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') redirect.headers.set(key, value)
    })
    return redirect
  }

  if (!isSignedIn && !matches(pathname, PUBLIC_ROUTES)) {
    return redirectTo('/login', { next: `${pathname}${search}` })
  }

  if (isSignedIn && matches(pathname, AUTH_ROUTES)) {
    return redirectTo('/dashboard')
  }

  return response
}
