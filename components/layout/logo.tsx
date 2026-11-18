import { Store } from 'lucide-react'
import Link from 'next/link'
import { siteConfig } from '@/lib/config/site'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl font-bold focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Store aria-hidden className="size-5" />
      </span>
      <span className="text-lg whitespace-nowrap">{siteConfig.name}</span>
    </Link>
  )
}
