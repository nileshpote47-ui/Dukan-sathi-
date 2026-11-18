import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/coming-soon'

export const metadata: Metadata = { title: 'Create' }

export default function CreatePage() {
  return <ComingSoon titleKey="nav.create" />
}
