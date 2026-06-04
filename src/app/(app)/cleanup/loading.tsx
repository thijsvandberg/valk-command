// Route-level loading fallback for /cleanup (BRDG-283). Mirrors the table the
// page renders: an inline header bar plus shimmering rows, so the layout does
// not jump when the real data arrives.
export default function CleanupLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-28 animate-pulse rounded bg-overlay-strong" />
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mb-5 flex gap-2">
          {["w-32", "w-28", "w-24", "w-36"].map((w, i) => (
            <div key={i} className={`h-8 ${w} animate-pulse rounded-lg bg-overlay-default`} />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border-subtle px-4 py-3"
              style={{ opacity: 1 - i * 0.07 }}
            >
              <div className="h-4 w-16 animate-pulse rounded bg-overlay-strong" />
              <div className="h-4 flex-1 animate-pulse rounded bg-overlay-default" />
              <div className="h-4 w-20 animate-pulse rounded bg-overlay-default" />
              <div className="h-4 w-24 animate-pulse rounded bg-overlay-default" />
              <div className="h-4 w-16 animate-pulse rounded bg-overlay-default" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
