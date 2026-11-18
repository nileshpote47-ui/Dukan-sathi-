'use client'

import { createContext, use, useMemo, type ReactNode } from 'react'
import { createTranslator, type Messages, type Translate } from './index'

const I18nContext = createContext<{ locale: string; t: Translate } | null>(null)

/** Makes translations available to client components. Server components use getTranslator(). */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: string
  messages: Messages
  children: ReactNode
}) {
  const value = useMemo(() => ({ locale, t: createTranslator(messages) }), [locale, messages])
  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n() {
  const value = use(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
