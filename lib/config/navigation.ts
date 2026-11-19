import {
  BarChart3,
  CalendarDays,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  Link2,
  type LucideIcon,
  PlusCircle,
  Send,
  Settings,
  Store,
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'

export interface NavItem {
  href: string
  labelKey: MessageKey
  icon: LucideIcon
  /** Sections not built yet show a Coming soon page (only Analytics so far). */
  comingSoon: boolean
  /** Shown in the bottom bar on phones (4 + the More menu, for comfortable tapping). */
  mobile: boolean
}

export const DASHBOARD_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, comingSoon: false, mobile: true },
  { href: '/dashboard/create', labelKey: 'nav.create', icon: PlusCircle, comingSoon: false, mobile: true },
  { href: '/dashboard/content', labelKey: 'nav.content', icon: FileText, comingSoon: false, mobile: true },
  { href: '/dashboard/calendar', labelKey: 'nav.calendar', icon: CalendarDays, comingSoon: false, mobile: true },
  { href: '/dashboard/media', labelKey: 'nav.media', icon: Images, comingSoon: false, mobile: false },
  { href: '/dashboard/publishing', labelKey: 'nav.publishing', icon: Send, comingSoon: false, mobile: false },
  { href: '/dashboard/accounts', labelKey: 'nav.accounts', icon: Link2, comingSoon: false, mobile: false },
  { href: '/dashboard/business', labelKey: 'nav.business', icon: Store, comingSoon: false, mobile: false },
  { href: '/dashboard/billing', labelKey: 'nav.billing', icon: CreditCard, comingSoon: false, mobile: false },
  { href: '/dashboard/settings', labelKey: 'nav.settings', icon: Settings, comingSoon: false, mobile: false },
  { href: '/dashboard/analytics', labelKey: 'nav.analytics', icon: BarChart3, comingSoon: false, mobile: false },
]
