import { SkeletonCard, SkeletonTable } from "@/components/shared/Skeleton";

// Route-level loading fallback for the /activity-log page. The real ViewHeader
// portals into the shell's header slot (empty during load), so an inline header
// bar approximates it at the top of the content area.
export default function ActivityLogLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-28 animate-pulse rounded bg-overlay-strong" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
          <SkeletonTable rows={8} />
        </div>
      </div>
    </div>
  );
}
