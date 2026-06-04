// Route-level loading fallback for the /test-center page. The real ViewHeader
// portals into the shell's header slot (empty during load), so an inline header
// bar approximates it at the top of the content area.
export default function TestCenterLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-28 animate-pulse rounded bg-overlay-strong" />
      </div>
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-overlay-default" />
          <div className="h-4 w-48 animate-pulse rounded bg-overlay-default" />
          <div className="h-3 w-64 animate-pulse rounded bg-overlay-subtle" />
        </div>
      </div>
    </div>
  );
}
