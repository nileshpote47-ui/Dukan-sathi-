import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/logo'
import { Providers } from '@/components/providers'
import { DEFAULT_LANGUAGE } from '@/lib/config/languages'
import { getMessages } from '@/lib/i18n'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers locale={DEFAULT_LANGUAGE} messages={getMessages(DEFAULT_LANGUAGE)}>
      <div className="flex min-h-dvh flex-col items-center px-4 py-8">
        <Logo />
        <main className="mt-8 w-full max-w-md">{children}</main>
      </div>
    </Providers>
  )
}
