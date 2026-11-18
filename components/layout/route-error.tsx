'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

/**
 * Shared body for error.tsx boundaries. Error boundaries render outside the
 * page's providers, so this uses the English dictionary directly.
 * The raw error is logged for developers but never shown to users.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = getTranslator('en')
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorState
      title={t('errors.pageTitle')}
      body={t('errors.pageBody')}
      action={<Button onClick={reset}>{t('common.tryAgain')}</Button>}
    />
  )
}
