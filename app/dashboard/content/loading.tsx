import { Skeleton } from '@/components/ui/states'

export default function ContentLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-6 h-28 w-full" />
      <div className="mt-6 grid gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}
