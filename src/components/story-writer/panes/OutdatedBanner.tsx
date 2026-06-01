"use client";

import { useState } from "react";
import { AlertTriangle, GitCompare, CloudDownload, Loader2 } from "lucide-react";

interface OutdatedBannerProps {
  /** Opens a diff of the current draft against the latest Jira version. Omitted when unavailable (e.g. split target). */
  onViewDifference?: () => void;
  /** Replaces the draft with the current Jira version and clears the warning. */
  onTakeJiraVersion: () => Promise<void> | void;
}

/**
 * Surfaces, inside the editor where the PO works, the same staleness signal the
 * History panel shows: the Jira version moved on after this draft's baseline.
 */
export function OutdatedBanner({ onViewDifference, onTakeJiraVersion }: OutdatedBannerProps) {
  const [taking, setTaking] = useState(false);

  const handleTake = async () => {
    if (taking) return;
    setTaking(true);
    try {
      await onTakeJiraVersion();
    } finally {
      setTaking(false);
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2"
    >
      <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 text-body-sm text-amber-300/90">
        Jira changed after this draft started. Your draft may be based on an older version.
      </span>
      {onViewDifference && (
        <button
          type="button"
          onClick={onViewDifference}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/20 bg-transparent px-2.5 py-1 text-body-sm font-medium text-amber-300/90 cursor-pointer transition-colors duration-150 hover:bg-amber-500/10 hover:text-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 active:scale-[0.98]"
        >
          <GitCompare size={12} strokeWidth={1.5} />
          View difference
        </button>
      )}
      <button
        type="button"
        onClick={handleTake}
        disabled={taking}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-body-sm font-medium text-amber-200 cursor-pointer transition-colors duration-150 hover:bg-amber-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {taking
          ? <Loader2 size={12} className="animate-spin" />
          : <CloudDownload size={12} strokeWidth={1.5} />}
        Take Jira version
      </button>
    </div>
  );
}
