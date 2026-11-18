import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage() {
  return <ComingSoon titleKey="nav.calendar" />
}
