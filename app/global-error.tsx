'use client'

import './globals.css'
import { RouteError } from '@/components/layout/route-error'

/** Last resort when the root layout itself fails: renders its own document. */
export default function GlobalError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <title>Dukaan Sathi</title>
        <main className="flex min-h-dvh items-center justify-center px-4">
          <RouteError {...props} />
        </main>
      </body>
    </html>
  )
}
