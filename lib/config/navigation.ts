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

/** Sidebar sections, in order (labels: nav.group.<id>). 'home' has no heading. */
export const NAV_GROUPS = ['home', 'create', 'reach', 'shop'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
  group: NavGroup
  href: string
  labelKey: MessageKey
  icon: LucideIcon
  /** Sections not built yet show a Coming soon page (only Analytics so far). */
  comingSoon: boolean
  /** Shown in the bottom bar on phones (4 + the More menu, for comfortable tapping). */
  mobile: boolean
}

export const DASHBOARD_NAV: NavItem[] = [
  { group: 'home', href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, comingSoon: false, mobile: true },
  { group: 'create', href: '/dashboard/create', labelKey: 'nav.create', icon: PlusCircle, comingSoon: false, mobile: true },
  { group: 'create', href: '/dashboard/content', labelKey: 'nav.content', icon: FileText, comingSoon: false, mobile: true },
  { group: 'create', href: '/dashboard/media', labelKey: 'nav.media', icon: Images, comingSoon: false, mobile: false },
  { group: 'reach', href: '/dashboard/calendar', labelKey: 'nav.calendar', icon: CalendarDays, comingSoon: false, mobile: true },
  { group: 'reach', href: '/dashboard/publishing', labelKey: 'nav.publishing', icon: Send, comingSoon: false, mobile: false },
  { group: 'reach', href: '/dashboard/accounts', labelKey: 'nav.accounts', icon: Link2, comingSoon: false, mobile: false },
  { group: 'shop', href: '/dashboard/analytics', labelKey: 'nav.analytics', icon: BarChart3, comingSoon: false, mobile: false },
  { group: 'shop', href: '/dashboard/business', labelKey: 'nav.business', icon: Store, comingSoon: false, mobile: false },
  { group: 'shop', href: '/dashboard/billing', labelKey: 'nav.billing', icon: CreditCard, comingSoon: false, mobile: false },
  { group: 'shop', href: '/dashboard/settings', labelKey: 'nav.settings', icon: Settings, comingSoon: false, mobile: false },
]
