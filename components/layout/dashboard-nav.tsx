'use client'

import { Bell, LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/app/(auth)/actions'
import { Dialog } from '@/components/ui/dialog'
import { DASHBOARD_NAV, NAV_GROUPS, type NavItem } from '@/lib/config/navigation'
import type { MessageKey } from '@/lib/i18n'
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

export interface ShellInfo {
  businessName: string
  /** e.g. "Grocery · Shirur" */
  businessMeta: string
  attention: { failedJobs: number; accountsToReconnect: number }
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group)
        if (!groupItems.length) return null
        const headingId = `nav-group-${group}`
        return (
          <div key={group} className="flex flex-col gap-1">
            {group !== 'home' && (
              <p id={headingId} className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {t(`nav.group.${group}` as MessageKey)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5" aria-labelledby={group !== 'home' ? headingId : undefined}>
              {groupItems.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition focus-visible:outline-2 focus-visible:outline-ring',
                        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-muted',
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
          </div>
        )
      })}
    </div>
  )
}

/** Bell with the number of things that need the owner (failed posts, accounts to reconnect). */
export function AttentionBell({ attention, className }: { attention: ShellInfo['attention']; className?: string }) {
  const { t } = useI18n()
  const count = attention.failedJobs + attention.accountsToReconnect
  const href = attention.failedJobs > 0 ? '/dashboard/publishing?tab=failed' : '/dashboard/accounts'
  const label = count > 0 ? t('nav.attention', { count }) : t('nav.attentionNone')
  return (
    <Link
      href={count > 0 ? href : '/dashboard/publishing'}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      <Bell aria-hidden className="size-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-foreground tabular-nums ring-2 ring-card">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}

function BusinessCard({ shell }: { shell: ShellInfo }) {
  return (
    <Link
      href="/dashboard/business"
      className="flex items-center gap-3 rounded-2xl border border-border p-2.5 transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-bold text-accent-foreground">
        {Array.from(shell.businessName.trim())[0] ?? '?'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{shell.businessName}</span>
        <span className="block truncate text-xs text-muted-foreground">{shell.businessMeta}</span>
      </span>
    </Link>
  )
}

/** Desktop sidebar (md and up). */
export function Sidebar({ shell }: { shell: ShellInfo }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('common.menu')} className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList items={DASHBOARD_NAV} />
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <BusinessCard shell={shell} />
        <LogoutButton />
      </div>
    </nav>
  )
}

/** Phone navigation: bottom tab bar for main sections, plus a "More" sheet for the rest. */
export function MobileNav({ shell }: { shell: ShellInfo }) {
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
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <BusinessCard shell={shell} />
          <LogoutButton />
        </div>
      </Dialog>
    </>
  )
}
