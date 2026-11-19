'use client'

import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'
import { getTranslator } from '@/lib/i18n'

/**
 * Shared body for error.tsx boundaries. Error boundaries render outside the page's providers,
 * so this uses the English dictionary directly. The raw error is never shown: in production
 * Next.js replaces it with a digest, shown here as a support reference that matches the
 * "[unhandled] server error" line in the server logs (instrumentation.ts).
 * "Try again" uses retry(), which fetches the page again (reset() would only re-render).
 */
export function RouteError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  const t = getTranslator('en')
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : null

  return (
    <ErrorState
      title={t('errors.pageTitle')}
      body={
        <>
          {t('errors.pageBody')}
          {digest ? <span className="mt-2 block text-xs">{t('errors.reference', { code: digest })}</span> : null}
        </>
      }
      action={<Button onClick={() => (retry ?? reset)?.()}>{t('common.tryAgain')}</Button>}
    />
  )
}
