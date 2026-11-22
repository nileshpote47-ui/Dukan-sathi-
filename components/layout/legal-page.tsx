import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/logo'
import { LegalFooter } from '@/components/layout/legal-footer'
import { siteConfig } from '@/lib/config/site'

/** Layout for the Privacy Policy and Terms (English, the legal version). */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      <header>
        <Logo />
      </header>
      <main className="py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {siteConfig.legalUpdated}</p>
        <div className="mt-6 flex flex-col gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  )
}

/** "write to us at <email>" or, before the email is configured, the in-app route. */
export function ContactLine() {
  return siteConfig.supportEmail ? (
    <>
      write to <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
    </>
  ) : (
    <>contact the Dukaan Sathi team (support email coming soon)</>
  )
}
