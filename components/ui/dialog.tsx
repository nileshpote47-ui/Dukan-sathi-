'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  closeLabel: string
  className?: string
}

/**
 * Accessible modal built on the native <dialog> element:
 * focus is trapped, Escape closes it, and focus returns to the opener.
 */
export function Dialog({ open, onClose, title, description, children, closeLabel, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // click on backdrop
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl',
        className,
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={closeLabel}
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {description && (
          <p id={descId} className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </dialog>
  )
}
