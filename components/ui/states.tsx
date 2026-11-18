import { AlertTriangle, CheckCircle2, Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Spinner } from './spinner'

/** Loading placeholder for a whole page or section. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn('flex min-h-48 flex-col items-center justify-center gap-3', className)}>
      <Spinner className="size-7 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

/** Grey shimmering block used to sketch content while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-muted', className)} />
}

interface StateProps {
  title: string
  body?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

function StatePanel({ title, body, icon: Icon, action, className, tone }: StateProps & { tone: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center', className)}>
      {Icon && (
        <span className={cn('flex size-12 items-center justify-center rounded-full', tone)}>
          <Icon aria-hidden className="size-6" />
        </span>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StatePanel icon={icon} tone="bg-muted text-muted-foreground" {...props} />
}

export function ErrorState({ icon = AlertTriangle, ...props }: StateProps) {
  return (
    <div role="alert">
      <StatePanel icon={icon} tone="bg-destructive-soft text-destructive" {...props} />
    </div>
  )
}

/** Confirmation / success panel (e.g. "Check your email"). */
export function ConfirmationState({ icon = CheckCircle2, ...props }: StateProps) {
  return (
    <div role="status">
      <StatePanel icon={icon} tone="bg-success-soft text-success" {...props} />
    </div>
  )
}

/** Inline form-level error message. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  )
}
