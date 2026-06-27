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
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning-subtle)] px-4 py-2.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <AlertTriangle
          size={15}
          strokeWidth={2}
          className="shrink-0 text-[var(--color-status-warning)]"
        />
        <span className="min-w-0 text-body-sm leading-snug text-text-primary">
          Jira changed after this draft started; your draft may be out of date.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onViewDifference && (
          <button
            type="button"
            onClick={onViewDifference}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-status-warning)]/30 px-2.5 py-1.5 text-body-sm font-medium text-[var(--color-status-warning)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-status-warning)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-warning)] active:scale-[0.98]"
          >
            <GitCompare size={13} strokeWidth={1.75} />
            View difference
          </button>
        )}
        <button
          type="button"
          onClick={handleTake}
          disabled={taking}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-status-warning)] bg-[var(--color-status-warning)] px-2.5 py-1.5 text-body-sm font-medium text-white cursor-pointer transition-colors duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-warning)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {taking
            ? <Loader2 size={13} className="animate-spin" />
            : <CloudDownload size={13} strokeWidth={1.75} />}
          Take Jira version
        </button>
      </div>
    </div>
  );
}
