'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import type { Messages } from '@/lib/i18n'
import { I18nProvider } from '@/lib/i18n/provider'

/** Client-side providers. Each layout passes the language for its user. */
export function Providers({ locale, messages, children }: { locale: string; messages: Messages; children: ReactNode }) {
  return (
    <I18nProvider locale={locale} messages={messages}>
      <ToastProvider closeLabel={messages['common.close']}>
        {/* lang lets screen readers pronounce Marathi/Hindi correctly. */}
        <div lang={locale} className="contents">
          {children}
        </div>
      </ToastProvider>
    </I18nProvider>
  )
}
