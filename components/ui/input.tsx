import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

const fieldBase =
  'w-full rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground/70 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ' +
  'aria-[invalid=true]:border-destructive disabled:opacity-60'

/** text-base (16px) prevents iOS from zooming into fields on focus. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'min-h-11 py-2', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2.5', className)} {...props} />
}

/** Native select: best usability on phones (uses the system picker). */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'min-h-11 appearance-auto py-2', className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="checkbox" className={cn('size-5 accent-primary', className)} {...props} />
}

export function Radio({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="radio" className={cn('size-5 accent-primary', className)} {...props} />
}
