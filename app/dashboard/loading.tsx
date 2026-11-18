import { Skeleton } from '@/components/ui/states'

/** Shown while a dashboard page loads. Mirrors the page layout to avoid jumps. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="mt-3 h-5 w-1/2 max-w-xs" />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-56" />
      </div>
    </div>
  )
}
