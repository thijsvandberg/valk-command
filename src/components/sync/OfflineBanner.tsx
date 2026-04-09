"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useActivityContext } from "@/contexts/ActivityContext";
import { Button } from "@/components/ui/Button";

export function OfflineBanner() {
  const { jiraOnline, retryHealth } = useActivityContext();

  if (jiraOnline) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/15">
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={2} />
      <span className="flex-1 text-xs text-amber-300/80 font-[var(--font-body)]">
        Jira unavailable, showing cached data
      </span>
      <Button
        variant="soft"
        size="sm"
        icon={<RefreshCw className="h-3 w-3" strokeWidth={2} />}
        onClick={retryHealth}
        className="text-amber-300 bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 focus-visible:outline-amber-400 font-[var(--font-body)]"
      >
        Retry
      </Button>
    </div>
  );
}
