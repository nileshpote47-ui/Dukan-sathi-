import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Content' }

export default function ContentPage() {
  return <ComingSoon titleKey="nav.content" />
}
