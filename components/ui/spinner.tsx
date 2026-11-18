import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('size-5 animate-spin', className)} />
}
