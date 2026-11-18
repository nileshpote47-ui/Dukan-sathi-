import {
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  PlusCircle,
  Settings,
  Store,
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'

export interface NavItem {
  href: string
  labelKey: MessageKey
  icon: LucideIcon
  /** Phase 1 only builds Dashboard and My Business; the rest show a Coming soon page. */
  comingSoon: boolean
  /** Shown in the bottom bar on phones (max 5 for comfortable tapping). */
  mobile: boolean
}

export const DASHBOARD_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, comingSoon: false, mobile: true },
  { href: '/dashboard/create', labelKey: 'nav.create', icon: PlusCircle, comingSoon: true, mobile: true },
  { href: '/dashboard/content', labelKey: 'nav.content', icon: FileText, comingSoon: true, mobile: true },
  { href: '/dashboard/calendar', labelKey: 'nav.calendar', icon: CalendarDays, comingSoon: true, mobile: false },
  { href: '/dashboard/business', labelKey: 'nav.business', icon: Store, comingSoon: false, mobile: true },
  { href: '/dashboard/analytics', labelKey: 'nav.analytics', icon: BarChart3, comingSoon: true, mobile: false },
  { href: '/dashboard/settings', labelKey: 'nav.settings', icon: Settings, comingSoon: true, mobile: false },
]
