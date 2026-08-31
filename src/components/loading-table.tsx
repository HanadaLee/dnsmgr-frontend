import { Skeleton } from '@/components/ui/skeleton'

export function LoadingTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
    </div>
  )
}
