export default function SprintBoardLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* ViewHeader skeleton */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-5 w-28 animate-pulse rounded bg-overlay-strong" />
        <div className="mx-1 h-4 w-px bg-border-default" />
        <div className="h-5 w-36 animate-pulse rounded bg-overlay-strong" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-20 animate-pulse rounded-md bg-overlay-default" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-overlay-default" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border-default px-5">
        {["w-20", "w-16", "w-24", "w-16", "w-20"].map((w, i) => (
          <div key={i} className={`h-6 ${w} animate-pulse rounded-md bg-overlay-default`} />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="flex-1 overflow-hidden px-5 py-2">
        {/* Table header */}
        <div className="flex h-9 items-center gap-4 border-b border-border-default">
          <div className="h-3 w-8 animate-pulse rounded bg-overlay-default" />
          <div className="h-3 w-14 animate-pulse rounded bg-overlay-strong" />
          <div className="h-3 w-64 animate-pulse rounded bg-overlay-strong" />
          <div className="ml-auto flex items-center gap-6">
            <div className="h-3 w-16 animate-pulse rounded bg-overlay-default" />
            <div className="h-3 w-14 animate-pulse rounded bg-overlay-default" />
            <div className="h-3 w-10 animate-pulse rounded bg-overlay-default" />
          </div>
        </div>
        {/* Table rows */}
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-border-subtle">
            <div className="h-3.5 w-8 animate-pulse rounded bg-overlay-default" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-overlay-default" />
            <div className={`h-3.5 animate-pulse rounded bg-overlay-default ${i % 3 === 0 ? "w-72" : i % 3 === 1 ? "w-56" : "w-64"}`} />
            <div className="ml-auto flex items-center gap-6">
              <div className="h-3.5 w-14 animate-pulse rounded bg-overlay-default" />
              <div className="h-3.5 w-10 animate-pulse rounded bg-overlay-default" />
              <div className="h-3.5 w-8 animate-pulse rounded bg-overlay-default" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
