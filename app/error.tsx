'use client'

import { RouteError } from '@/components/layout/route-error'

/** Errors on public pages (landing, pricing, sign-in) outside the dashboard and onboarding. */
export default function AppError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <RouteError {...props} />
    </main>
  )
}
