'use client'

import { CheckCircle2, X, XCircle } from 'lucide-react'
import { createContext, use, useCallback, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

type ToastKind = 'success' | 'error'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null)

/** Short status messages. Announced to screen readers via a live region. */
export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random()
      setToasts((all) => [...all, { id, kind, message }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  return (
    <ToastContext value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border p-3 shadow-lg',
              toast.kind === 'success' ? 'border-success/30 bg-success-soft' : 'border-destructive/30 bg-destructive-soft',
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
            ) : (
              <XCircle aria-hidden className="size-5 shrink-0 text-destructive" />
            )}
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-black/5"
              aria-label={closeLabel}
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}

export function useToast() {
  const show = use(ToastContext)
  if (!show) throw new Error('useToast must be used inside <ToastProvider>')
  return { success: (m: string) => show('success', m), error: (m: string) => show('error', m) }
}
