'use client'

import { LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/app/(auth)/actions'
import { Dialog } from '@/components/ui/dialog'
import { DASHBOARD_NAV, type NavItem } from '@/lib/config/navigation'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(`${href}/`)
}

function SoonBadge({ label }: { label: string }) {
  return <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">{label}</span>
}

function LogoutButton({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <form action={logout}>
      <button
        type="submit"
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
          className,
        )}
      >
        <LogOut aria-hidden className="size-5" />
        {t('auth.logout')}
      </button>
    </form>
  )
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium focus-visible:outline-2 focus-visible:outline-ring',
                active ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-muted',
              )}
            >
              <item.icon aria-hidden className="size-5 shrink-0" />
              {t(item.labelKey)}
              {item.comingSoon && <SoonBadge label={t('common.comingSoon')} />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Desktop sidebar (md and up). */
export function Sidebar() {
  const { t } = useI18n()
  return (
    <nav aria-label={t('common.menu')} className="flex h-full flex-col gap-4">
      <NavList items={DASHBOARD_NAV} />
      <div className="mt-auto border-t border-border pt-4">
        <LogoutButton />
      </div>
    </nav>
  )
}

/** Phone navigation: bottom tab bar for main sections, plus a "More" sheet for the rest. */
export function MobileNav() {
  const pathname = usePathname()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const primary = DASHBOARD_NAV.filter((item) => item.mobile)
  const moreActive = DASHBOARD_NAV.some((item) => !item.mobile && isActive(pathname, item.href))

  const tabClass = (active: boolean) =>
    cn(
      'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      active ? 'text-primary' : 'text-muted-foreground',
    )

  return (
    <>
      <nav
        aria-label={t('common.menu')}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
              <item.icon aria-hidden className="size-5" />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          )
        })}
        <button type="button" onClick={() => setOpen(true)} className={tabClass(moreActive)} aria-haspopup="dialog">
          <Menu aria-hidden className="size-5" />
          {t('common.more')}
        </button>
      </nav>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('common.menu')} closeLabel={t('common.close')}>
        <NavList items={DASHBOARD_NAV} onNavigate={() => setOpen(false)} />
        <div className="mt-4 border-t border-border pt-4">
          <LogoutButton />
        </div>
      </Dialog>
    </>
  )
}
