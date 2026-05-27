"use client";

import { useRef, useState, useEffect } from "react";
import { RefreshCw, CloudDownload, History } from "lucide-react";

interface SyncDropdownProps {
  onSyncSprint: () => void;
  onSyncHistory: () => void;
  isSyncing: boolean;
  isSyncingHistory: boolean;
  disabled?: boolean;
}

export function SyncDropdown({
  onSyncSprint,
  onSyncHistory,
  isSyncing,
  isSyncingHistory,
  disabled,
}: SyncDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const anyRunning = isSyncing || isSyncingHistory;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Sync options"
        className={[
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm transition-colors duration-150 cursor-pointer",
          "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary",
          "disabled:opacity-25 disabled:cursor-not-allowed",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
          open ? "bg-overlay-default text-text-secondary" : "",
        ].join(" ")}
      >
        <RefreshCw
          size={12}
          strokeWidth={1.5}
          className={anyRunning ? "animate-spin" : ""}
        />
        Sync
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-lg shadow-black/40">
          <button
            type="button"
            onClick={() => { onSyncSprint(); setOpen(false); }}
            disabled={isSyncing || disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CloudDownload size={12} strokeWidth={1.5} className={isSyncing ? "animate-spin" : ""} />
            Sync current sprint
          </button>
          <button
            type="button"
            onClick={() => { onSyncHistory(); setOpen(false); }}
            disabled={isSyncingHistory || disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />
            Sync history
          </button>
        </div>
      )}
    </div>
  );
}
