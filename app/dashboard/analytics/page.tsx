import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Analytics' }

export default function AnalyticsPage() {
  return <ComingSoon titleKey="nav.analytics" />
}
