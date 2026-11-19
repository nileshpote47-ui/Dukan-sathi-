'use client'

import { RouteError } from '@/components/layout/route-error'

export default function DashboardError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return <RouteError {...props} />
}
