'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox, Radio } from '@/components/ui/input'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { LANGUAGES, type LanguageCode } from '@/lib/config/languages'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { saveSettings } from './actions'

export function SettingsForm({ language, productUpdateEmails }: { language: LanguageCode; productUpdateEmails: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const hintId = useId()
  const [lang, setLang] = useState(language)
  const [updates, setUpdates] = useState(productUpdateEmails)
  const [error, setError] = useState<MessageKey | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          setError(null)
          const result = await saveSettings({ preferredLanguage: lang, productUpdateEmails: updates })
          if (!result.ok) {
            setError(result.error)
            return
          }
          toast.success(t('settings.saved'))
          router.refresh() // re-render in the newly chosen language
        })
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('settings.appLanguage')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {LANGUAGES.map((l) => (
            <label
              key={l.code}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-input bg-card px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <Radio name="language" value={l.code} checked={lang === l.code} onChange={() => setLang(l.code)} />
              <span className="font-medium">{l.nativeLabel}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('settings.notifications')}</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <Checkbox checked={updates} onChange={(e) => setUpdates(e.target.checked)} aria-describedby={hintId} className="mt-0.5" />
          <span>
            {t('settings.productUpdates')}
            <span id={hintId} className="block text-sm text-muted-foreground">
              {t('settings.productUpdatesHint')}
            </span>
          </span>
        </label>
      </fieldset>

      <FormError message={error ? t(error) : null} />
      <Button type="submit" loading={pending} className="self-start">
        {pending ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  )
}
