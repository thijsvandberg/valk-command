export default function RefinementLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* ViewHeader skeleton */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-24 animate-pulse rounded bg-overlay-strong" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-md bg-overlay-default" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-overlay-default" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Ticket list area */}
        <div className="min-w-0 flex-1 px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-36 animate-pulse rounded bg-overlay-default" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-20 animate-pulse rounded-md bg-overlay-default" />
              <div className="h-7 w-20 animate-pulse rounded-md bg-overlay-default" />
            </div>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-12 items-center gap-4 border-b border-border-subtle">
              <div className="h-3.5 w-16 animate-pulse rounded bg-overlay-default" />
              <div className={`h-3.5 animate-pulse rounded bg-overlay-default ${i % 2 === 0 ? "w-56" : "w-44"}`} />
              <div className="ml-auto h-3.5 w-14 animate-pulse rounded bg-overlay-default" />
            </div>
          ))}
        </div>

        {/* Queue panel skeleton */}
        <div className="w-72 shrink-0 border-l border-border-default bg-[var(--color-surface-chrome)] p-4">
          <div className="mb-3 h-4 w-20 animate-pulse rounded bg-overlay-strong" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="mb-2 rounded-md border border-border-subtle p-3">
              <div className="h-3.5 w-16 animate-pulse rounded bg-overlay-default" />
              <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-overlay-default" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
