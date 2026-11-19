'use client'

import { RouteError } from '@/components/layout/route-error'

export default function OnboardingError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <RouteError {...props} />
    </main>
  )
}
