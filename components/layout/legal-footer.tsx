import Link from 'next/link'
import { siteConfig } from '@/lib/config/site'

/** Footer for public pages: Privacy Policy, Terms and the support email. */
export function LegalFooter() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
      <span>© 2026 {siteConfig.name}</span>
      <Link href="/privacy" className="min-h-11 content-center underline-offset-4 hover:underline">
        Privacy Policy
      </Link>
      <Link href="/terms" className="min-h-11 content-center underline-offset-4 hover:underline">
        Terms
      </Link>
      {siteConfig.supportEmail && (
        <a href={`mailto:${siteConfig.supportEmail}`} className="min-h-11 content-center underline-offset-4 hover:underline">
          {siteConfig.supportEmail}
        </a>
      )}
    </footer>
  )
}
