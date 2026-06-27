import { Skeleton, skeletonRowOpacity } from "@/components/shared/Skeleton";

export function EpicListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border-default bg-surface-elevated px-4 py-3.5"
          style={{ opacity: skeletonRowOpacity(i) }}
        >
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-5 flex-[2] rounded" />
          <Skeleton className="hidden h-8 w-32 rounded md:block" />
          <Skeleton className="h-2 flex-[2] rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Route-level loading fallback for the /epics page.
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Skeleton className="mb-5 h-4 w-96 max-w-full rounded" />
          <EpicListSkeleton />
        </div>
      </div>
    </div>
  );
}
