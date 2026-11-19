'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { connectWhatsAppAction } from '@/app/dashboard/accounts/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/*
 * WhatsApp Embedded Signup (Meta's official onboarding, Facebook JS SDK + Login for Business
 * configuration). The popup returns a short-lived code (to the callback) and the WABA / phone
 * number ids (window message from facebook.com). Both go to the server, which exchanges the code
 * and verifies the ids with the resulting token. The app id and configuration id are public.
 * In tests (mock) the popup is skipped.
 */

declare global {
  interface Window {
    FB?: { init(o: object): void; login(cb: (r: { authResponse?: { code?: string } }) => void, o: object): void }
    fbAsyncInit?: () => void
  }
}

const SDK = 'https://connect.facebook.net/en_US/sdk.js'

export function WhatsAppSignupButton({ appId, configId, graphVersion, mock, label }: { appId: string | null; configId: string | null; graphVersion: string; mock: boolean; label: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()
  const [opening, setOpening] = useState(false)
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({})

  useEffect(() => {
    if (mock || !appId) return
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && typeof data.event === 'string' && data.event.startsWith('FINISH')) {
          session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id }
        }
      } catch {
        // Other messages from facebook.com are not for us.
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [mock, appId])

  const finish = (code: string, wabaId?: string, phoneNumberId?: string) =>
    startTransition(async () => {
      const result = await connectWhatsAppAction({ code, wabaId, phoneNumberId })
      if (!result.ok) return setError(result.error)
      toast.success(t('publishing.accounts.connected', { n: result.data?.count ?? 1 }))
      router.refresh()
    })

  const loadSdk = () =>
    new Promise<void>((resolve, reject) => {
      if (window.FB) return resolve()
      window.fbAsyncInit = () => {
        window.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version: graphVersion })
        resolve()
      }
      const script = document.createElement('script')
      script.src = SDK
      script.async = true
      script.crossOrigin = 'anonymous'
      script.onerror = () => reject(new Error('sdk'))
      document.body.appendChild(script)
    })

  const start = async () => {
    setError(null)
    if (mock) return finish('mock_code', '100000000000001', '100000000000002')
    if (!appId || !configId) return setError('publishing.accounts.error.not_configured')
    setOpening(true)
    try {
      await loadSdk()
    } catch {
      setOpening(false)
      return setError('publishing.accounts.connectFailed')
    }
    window.FB!.login(
      (response) => {
        setOpening(false)
        const code = response.authResponse?.code
        // The session message can arrive just after the callback.
        setTimeout(() => {
          const { wabaId, phoneNumberId } = session.current
          if (!code || !wabaId || !phoneNumberId) return setError('publishing.accounts.error.denied')
          finish(code, wabaId, phoneNumberId)
        }, 500)
      },
      { config_id: configId, response_type: 'code', override_default_response_type: true, extras: { setup: {} } },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={start} loading={pending || opening}>
        {opening ? t('publishing.accounts.waLoading') : label}
      </Button>
      <ActionError messageKey={error} />
    </div>
  )
}
