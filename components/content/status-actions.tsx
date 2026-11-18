'use client'

import { Archive, CalendarClock, CheckCircle2, Undo2, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { setContentStatus } from '@/app/dashboard/content/actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { STATUS_TRANSITIONS, type ContentStatus } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { isoToIstInput } from '@/lib/utils/datetime'

const ACTION_ICONS: Partial<Record<ContentStatus, LucideIcon>> = {
  READY: CheckCircle2,
  SCHEDULED: CalendarClock,
  DRAFT: Undo2,
  ARCHIVED: Archive,
}

/**
 * Buttons for the status changes allowed from the current status
 * (same rules as the database). Scheduling asks for a date; archiving asks to confirm.
 */
export function StatusActions({ id, status, scheduledFor }: { id: string; status: ContentStatus; scheduledFor: string | null }) {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const dateId = useId()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<MessageKey | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [date, setDate] = useState(() => (scheduledFor ? isoToIstInput(scheduledFor) : ''))

  const options = STATUS_TRANSITIONS[status]

  const change = (to: ContentStatus, scheduledForInput?: string) =>
    startTransition(async () => {
      setError(null)
      const result = await setContentStatus({ id, to, scheduledFor: scheduledForInput })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setScheduling(false)
      setConfirmArchive(false)
      toast.success(t('content.statusChanged'))
      router.refresh()
    })

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{status === 'ARCHIVED' ? t('content.archivedNote') : t('content.noActions')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {options.map((to) => {
          const Icon = ACTION_ICONS[to]
          const onClick =
            to === 'SCHEDULED' ? () => setScheduling(true) : to === 'ARCHIVED' ? () => setConfirmArchive(true) : () => change(to)
          return (
            <Button
              key={to}
              variant={to === 'ARCHIVED' ? 'secondary' : to === 'DRAFT' ? 'secondary' : 'primary'}
              onClick={onClick}
              disabled={pending}
              aria-expanded={to === 'SCHEDULED' ? scheduling : undefined}
            >
              {Icon && <Icon aria-hidden className="size-4" />}
              {t(`content.action.${to}` as MessageKey)}
            </Button>
          )
        })}
      </div>

      {scheduling && (
        <form
          noValidate // show our translated messages instead of the browser's
          className="flex flex-col gap-3 rounded-xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            change('SCHEDULED', date)
          }}
        >
          <label htmlFor={dateId} className="text-sm font-medium">
            {t('content.scheduleLabel')}
          </label>
          <Input
            id={dateId}
            type="datetime-local"
            required
            value={date}
            min={isoToIstInput(new Date().toISOString())}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={error === 'errors.scheduleInvalid' || error === 'errors.scheduleInPast' ? true : undefined}
          />
          <p className="text-sm text-muted-foreground">{t('publishing.notice')}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setScheduling(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('content.scheduleConfirm')}
            </Button>
          </div>
        </form>
      )}

      <FormError message={error ? t(error) : null} />

      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={t('content.archiveTitle')}
        description={t('content.archiveBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmArchive(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => change('ARCHIVED')} loading={pending}>
            {t('content.archiveConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
