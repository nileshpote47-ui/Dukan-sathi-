'use client'

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/provider'
import { decodeMessage } from '@/lib/validation/fields'

interface FormFieldProps {
  label: string
  /** Encoded validation message (see lib/validation/fields.ts); translated here. */
  error?: string
  hint?: string
  optional?: boolean
  /** A single Input / Select / Textarea; it gets id and aria attributes wired up. */
  children: ReactElement<Record<string, unknown>>
  className?: string
  /** Extra content under the field (e.g. a checkbox). */
  footer?: ReactNode
}

/** Label + control + hint + accessible error message. */
export function FormField({ label, error, hint, optional, children, className, footer }: FormFieldProps) {
  const { t } = useI18n()
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const decoded = error ? decodeMessage(error) : null

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> ({t('common.optional')})</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {decoded && (
        <p id={errorId} className="mt-1 text-sm font-medium text-destructive">
          {t(decoded.key, decoded.values)}
        </p>
      )}
      {footer}
    </div>
  )
}
