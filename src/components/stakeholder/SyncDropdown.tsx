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
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors duration-150 cursor-pointer",
          "bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60",
          "disabled:opacity-25 disabled:cursor-not-allowed",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
          open ? "bg-white/[0.07] text-white/60" : "",
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
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-lg shadow-black/40">
          <button
            type="button"
            onClick={() => { onSyncSprint(); setOpen(false); }}
            disabled={isSyncing || disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/50 cursor-pointer hover:bg-white/[0.05] hover:text-white/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CloudDownload size={12} strokeWidth={1.5} className={isSyncing ? "animate-spin" : ""} />
            Sync current sprint
          </button>
          <button
            type="button"
            onClick={() => { onSyncHistory(); setOpen(false); }}
            disabled={isSyncingHistory || disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/50 cursor-pointer hover:bg-white/[0.05] hover:text-white/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <History size={12} strokeWidth={1.5} className={isSyncingHistory ? "animate-spin" : ""} />
            Sync history
          </button>
        </div>
      )}
    </div>
  );
}
