'use client'

import { CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/provider'

const POLL_MS = 3000
const MAX_POLLS = 20

/**
 * After a verified payment, waits for the provider's webhook to activate the plan by
 * re-reading SERVER state (router.refresh) — never by trusting the browser.
 */
export function ActivationWatcher({ expectedPlan, currentPlan, expectedName }: { expectedPlan: string; currentPlan: string; expectedName: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [polls, setPolls] = useState(0)
  const active = currentPlan === expectedPlan

  useEffect(() => {
    if (active || polls >= MAX_POLLS) return
    const timer = setTimeout(() => {
      setPolls((n) => n + 1)
      router.refresh()
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [active, polls, router])

  if (active) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm font-medium text-success">
        <CheckCircle2 aria-hidden className="size-4" />
        {t('billing.activated', { plan: expectedName })}
      </p>
    )
  }
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm font-medium">
      {polls < MAX_POLLS && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {polls < MAX_POLLS ? t('billing.activating') : t('billing.activationSlow')}
    </p>
  )
}
