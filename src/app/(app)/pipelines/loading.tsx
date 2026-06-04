import { PipelineSkeleton } from "./PipelineSkeleton";

// Route-level loading fallback for the /pipelines page. Reuses the same skeleton
// the page renders while its data loads, with an inline header bar (the real
// ViewHeader portals into the shell's header slot, which is empty during load).
export default function PipelinesLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border-default px-5">
        <div className="h-4 w-4 animate-pulse rounded bg-overlay-strong" />
        <div className="h-5 w-24 animate-pulse rounded bg-overlay-strong" />
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <PipelineSkeleton />
      </div>
    </div>
  );
}
