export function EpicListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border-default bg-surface-elevated px-4 py-3.5"
          style={{ opacity: 1 - i * 0.14 }}
        >
          <div className="h-4 w-4 shrink-0 rounded bg-overlay-subtle" />
          <div className="h-5 flex-[2] animate-pulse rounded bg-overlay-subtle" />
          <div className="hidden h-8 w-32 animate-pulse rounded bg-overlay-subtle md:block" />
          <div className="h-2 flex-[2] animate-pulse rounded-full bg-overlay-subtle" />
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
          <div className="mb-5 h-4 w-96 max-w-full animate-pulse rounded bg-overlay-subtle" />
          <EpicListSkeleton />
        </div>
      </div>
    </div>
  );
}
