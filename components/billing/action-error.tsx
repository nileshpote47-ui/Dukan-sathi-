'use client'

import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { isLimitError } from '@/lib/config/billing'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/** Error message for an action; for a reached plan limit it links to the plans. */
export function ActionError({ messageKey }: { messageKey: MessageKey | null }) {
  const { t } = useI18n()
  if (!messageKey) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>{t(messageKey)}</p>
        {isLimitError(messageKey) && (
          <Link href="/dashboard/billing" className="font-semibold text-foreground underline underline-offset-4">
            {t('billing.viewPlans')}
          </Link>
        )}
      </div>
    </div>
  )
}
