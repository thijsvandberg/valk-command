"use client";

import { Loader2 } from "lucide-react";
import { formatTimeAgo } from "./pipeline-helpers";

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
      <span className={`text-body-sm ${isCatchingUp ? "text-amber-400/80" : "text-[var(--color-brand-400)]/80"}`}>
        {isCatchingUp
          ? `Catching up on historical pipeline data... (synced up to ${watermarkAge})`
          : "Syncing latest pipeline data from Bitbucket..."
        }
      </span>
    </div>
  );
}
