"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useSyncContext } from "@/contexts/SyncContext";

export function OfflineBanner() {
  const { jiraOnline, retryHealth } = useSyncContext();

  if (jiraOnline) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/15">
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={2} />
      <span className="flex-1 text-xs text-amber-300/80 font-[var(--font-body)]">
        Jira unavailable, showing cached data
      </span>
      <button
        type="button"
        onClick={retryHealth}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-300 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400 active:scale-95 transition-colors duration-150 font-[var(--font-body)]"
      >
        <RefreshCw className="h-3 w-3" strokeWidth={2} />
        Retry
      </button>
    </div>
  );
}
