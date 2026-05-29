export default function ChatLoading() {
  return (
    <div className="flex h-full">
      {/* Conversation list panel */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border-default">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-4">
          <div className="h-5 w-12 animate-pulse rounded bg-overlay-strong" />
          <div className="ml-auto h-7 w-7 animate-pulse rounded-md bg-overlay-default" />
        </div>
        {/* Conversation rows */}
        <div className="flex-1 overflow-hidden px-2 py-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2.5">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-overlay-default" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className={`h-3.5 animate-pulse rounded bg-overlay-strong ${i % 2 === 0 ? "w-32" : "w-24"}`} />
                <div className={`h-3 animate-pulse rounded bg-overlay-default ${i % 3 === 0 ? "w-40" : "w-28"}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
          <div className="h-5 w-40 animate-pulse rounded bg-overlay-strong" />
        </div>
        {/* Empty message area */}
        <div className="flex-1" />
        {/* Input skeleton */}
        <div className="border-t border-border-default px-5 py-3">
          <div className="h-10 w-full animate-pulse rounded-lg bg-overlay-default" />
        </div>
      </div>
    </div>
  );
}
