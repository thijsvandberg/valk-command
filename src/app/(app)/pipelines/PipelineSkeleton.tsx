"use client";

import { Loader2 } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { formatTimeAgo } from "./pipeline-helpers";

export function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="px-4 py-3">
            <div className="h-3 w-16 rounded bg-white/[0.04] mb-3" style={{ animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 100}ms` }} />
            <div className="h-6 w-12 rounded bg-white/[0.06]" style={{ animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 100 + 50}ms` }} />
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
          <div className="h-3 w-64 rounded bg-white/[0.04]" />
        </div>
        {[0.9, 0.7, 0.85, 0.6, 0.75, 0.8, 0.65].map((w, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-b-0">
            <div className="h-3 rounded bg-white/[0.04]" style={{ width: `${w * 100}%`, animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SyncStatusBanner({ syncStatus, syncing }: {
  syncStatus: { watermark: string | null; remaining: number; lastNewRuns: number } | null;
  syncing: boolean;
}) {
  const isCatchingUp = syncStatus && syncStatus.remaining > 0;
  const watermarkAge = syncStatus?.watermark
    ? formatTimeAgo(syncStatus.watermark)
    : null;

  if (!syncing && !isCatchingUp) return null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 mb-6 ${
      isCatchingUp
        ? "border-amber-500/15 bg-amber-500/[0.04]"
        : "border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.04]"
    }`}>
      <Loader2 size={13} strokeWidth={2} className={`animate-spin ${isCatchingUp ? "text-amber-400" : "text-[var(--color-brand-400)]"}`} />
      <span className={`text-[12px] ${isCatchingUp ? "text-amber-400/80" : "text-[var(--color-brand-400)]/80"}`}>
        {isCatchingUp
          ? `Catching up on historical pipeline data... (synced up to ${watermarkAge})`
          : "Syncing latest pipeline data from Bitbucket..."
        }
      </span>
    </div>
  );
}
