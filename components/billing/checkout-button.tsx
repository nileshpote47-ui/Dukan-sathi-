'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { completeMockCheckout, confirmCheckout, startCheckout, type StartCheckoutResult } from '@/app/dashboard/billing/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/*
 * Starts checkout for a paid plan. The server creates the provider subscription (price from
 * the database); Razorpay Checkout collects the payment; the server verifies the signature;
 * the plan is activated by the provider's signed webhook (the page then polls server state).
 */

interface RazorpayResponse {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}
interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Checkout failed to load')))
    if (!existing) {
      script.src = CHECKOUT_SCRIPT
      script.async = true
      document.body.appendChild(script)
    }
  })
}

type Phase = 'idle' | 'starting' | 'checkout' | 'verifying'

export function CheckoutButton({ planSlug, label, priceLabel }: { planSlug: string; label: string; priceLabel: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const busy = useRef(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<MessageKey | null>(null)
  const [mock, setMock] = useState<StartCheckoutResult | null>(null)

  const finish = () => {
    busy.current = false
    setPhase('idle')
  }

  async function verify(session: StartCheckoutResult, response: RazorpayResponse) {
    setPhase('verifying')
    // The subscription id comes from our server, never from the checkout response (Razorpay docs).
    const result = await confirmCheckout({
      paymentId: response.razorpay_payment_id,
      subscriptionId: session.subscriptionId,
      signature: response.razorpay_signature,
    })
    finish()
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(t('billing.paymentVerified'))
    router.push(`/dashboard/billing?activating=${planSlug}`)
    router.refresh()
  }

  async function start() {
    if (busy.current) return
    busy.current = true
    setError(null)
    setPhase('starting')
    const result = await startCheckout(planSlug)
    if (!result.ok || !result.data) {
      setError(result.ok ? 'billing.error.provider' : result.error)
      finish()
      return
    }
    const session = result.data
    if (session.provider === 'mock') {
      setMock(session)
      setPhase('checkout')
      return
    }
    try {
      await loadRazorpay()
    } catch {
      setError('billing.error.checkoutLoad')
      finish()
      return
    }
    const checkout = new window.Razorpay!({
      key: session.keyId,
      subscription_id: session.subscriptionId,
      name: 'Dukaan Sathi',
      description: session.planName,
      prefill: session.prefill,
      theme: { color: '#0f766e' },
      handler: (response: RazorpayResponse) => void verify(session, response),
      modal: {
        ondismiss: () => {
          if (busy.current) {
            finish()
            toast.error(t('billing.paymentCancelled'))
          }
        },
      },
    })
    checkout.on('payment.failed', () => setError('billing.paymentFailed'))
    setPhase('checkout')
    checkout.open()
  }

  async function mockOutcome(outcome: 'success' | 'failure') {
    if (!mock) return
    const session = mock
    setMock(null)
    const result = await completeMockCheckout({ subscriptionId: session.subscriptionId, outcome })
    if (!result.ok || !result.data) {
      setError(result.ok ? 'billing.error.provider' : result.error)
      finish()
      return
    }
    await verify(session, {
      razorpay_payment_id: result.data.paymentId,
      razorpay_subscription_id: result.data.subscriptionId,
      razorpay_signature: result.data.signature,
    })
  }

  const busyLabel: Partial<Record<Phase, MessageKey>> = {
    starting: 'billing.checkoutStarting',
    checkout: 'billing.paymentPending',
    verifying: 'billing.paymentVerifying',
  }
  const busyKey = busyLabel[phase]

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" fullWidth onClick={start} loading={phase !== 'idle'}>
        {busyKey ? t(busyKey) : label}
      </Button>
      <ActionError messageKey={error} />
      <Dialog
        open={mock !== null}
        onClose={() => {
          setMock(null)
          finish()
          toast.error(t('billing.paymentCancelled'))
        }}
        title={t('billing.mockTitle')}
        description={t('billing.mockBody', { price: priceLabel })}
        closeLabel={t('common.close')}
      >
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => void mockOutcome('failure')}>
            {t('billing.mockFail')}
          </Button>
          <Button type="button" onClick={() => void mockOutcome('success')}>
            {t('billing.mockPay', { price: priceLabel })}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
