import { Skeleton } from '@/components/ui/states'

export default function CalendarLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-9 w-48" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}
