export default function StoryWriterLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* ViewHeader skeleton */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-28 animate-pulse rounded bg-overlay-strong" />
        <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-overlay-default" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl">
          {/* Session count + button */}
          <div className="mb-5 flex items-center justify-between">
            <div className="h-5 w-32 animate-pulse rounded bg-overlay-default" />
            <div className="h-9 w-28 animate-pulse rounded-md bg-overlay-strong" />
          </div>

          {/* Session card grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border-default bg-surface-elevated p-4"
                style={{ minHeight: 120 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="h-5 w-20 animate-pulse rounded bg-overlay-strong" />
                  <div className="h-4 w-16 animate-pulse rounded bg-overlay-default" />
                </div>
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-overlay-default" />
                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-overlay-default" />
                    <div className="h-3 w-12 animate-pulse rounded bg-overlay-default" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-7 w-16 animate-pulse rounded-md bg-overlay-default" />
                    <div className="h-7 w-16 animate-pulse rounded-md bg-overlay-default" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
