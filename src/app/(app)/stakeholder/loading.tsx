import { SkeletonCard, SkeletonLine } from "@/components/shared/Skeleton";

// Route-level loading fallback for the /stakeholder page. The real ViewHeader
// portals into the shell's header slot (empty during load), so an inline header
// bar approximates it at the top of the content area.
export default function StakeholderLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-32 animate-pulse rounded bg-overlay-strong" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-md bg-overlay-default" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-overlay-default" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <SkeletonLine width="w-64" height="h-6" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
