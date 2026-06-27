import { Skeleton, skeletonRowOpacity } from "@/components/shared/Skeleton";

// Route-level loading fallback for /cleanup (BRDG-283). Mirrors the table the
// page renders: an inline header bar plus shimmering rows, so the layout does
// not jump when the real data arrives.
export default function CleanupLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-5 w-28 rounded" />
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mb-5 flex gap-2">
          {["w-32", "w-28", "w-24", "w-36"].map((w, i) => (
            <Skeleton key={i} className={`h-8 ${w} rounded-lg`} />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border-subtle px-4 py-3"
              style={{ opacity: skeletonRowOpacity(i) }}
            >
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
