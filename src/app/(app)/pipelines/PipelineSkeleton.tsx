"use client";

import { SkeletonCard, SkeletonTable } from "@/components/shared/Skeleton";

export function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
      <SkeletonTable rows={7} />
    </div>
  );
}

// Re-export SyncStatusBanner from its own file for backwards compatibility
export { SyncStatusBanner } from "./SyncStatusBanner";
