// Streaming skeleton: shown by Next.js before the page JS bundle loads.
// Matches the real ticket detail layout (header + tabs + content + sidebar)
// so the transition feels seamless once data arrives.
export default function TicketDetailLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* ViewHeader skeleton */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-5 w-16 animate-pulse rounded bg-overlay-strong" />
        <div className="mx-1 h-4 w-px bg-border-default" />
        <div className="h-5 w-48 animate-pulse rounded bg-overlay-strong" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {/* Tab bar skeleton */}
          <div className="border-b border-border-default">
            <div className="mx-auto flex h-[44px] max-w-4xl items-center gap-4 px-8">
              {["w-16", "w-14", "w-14", "w-20", "w-24"].map((w, i) => (
                <div key={i} className={`h-3.5 ${w} animate-pulse rounded bg-overlay-strong`} />
              ))}
            </div>
          </div>

          {/* Content skeleton */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-8 py-6">
              {/* Title */}
              <div className="mt-3 space-y-3">
                <div className="h-7 w-3/4 animate-pulse rounded bg-overlay-strong" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-overlay-default" />
              </div>
              {/* Description lines */}
              <div className="mt-8 space-y-2.5">
                <div className="h-3.5 w-full animate-pulse rounded bg-overlay-default" />
                <div className="h-3.5 w-5/6 animate-pulse rounded bg-overlay-default" />
                <div className="h-3.5 w-4/6 animate-pulse rounded bg-overlay-default" />
                <div className="h-3.5 w-full animate-pulse rounded bg-overlay-default" />
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-overlay-default" />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="w-[320px] shrink-0 border-l border-border-default bg-[var(--color-surface-chrome)]">
          <div className="p-5 space-y-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-overlay-strong" />
                <div className="h-4 w-24 animate-pulse rounded bg-overlay-default" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
