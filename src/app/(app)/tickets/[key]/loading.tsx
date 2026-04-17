export default function TicketDetailLoading() {
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          {/* Breadcrumb skeleton */}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-3 animate-pulse rounded bg-white/[0.04]" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
          </div>

          {/* Title and badges skeleton */}
          <div className="mt-6 space-y-4">
            <div className="h-8 w-96 animate-pulse rounded bg-white/[0.06]" />
            <div className="flex gap-2">
              <div className="h-6 w-24 animate-pulse rounded-md bg-white/[0.06]" />
              <div className="h-6 w-20 animate-pulse rounded-md bg-white/[0.06]" />
            </div>

            {/* Description skeleton */}
            <div className="mt-8 space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      {/* Details rail skeleton */}
      <div className="w-72 shrink-0 border-l border-border-default bg-[var(--color-surface-elevated)] p-5 xl:w-80">
        <div className="space-y-4">
          <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="h-3 w-14 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
