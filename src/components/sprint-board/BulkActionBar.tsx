"use client";

import { useState, useRef, useEffect } from "react";
import type { POStatus } from "./mock-data";
import { PO_STATUS_OPTIONS } from "./mock-data";
import { PO_STATUS_COLORS } from "./FilterBar";
import { POStatusIcon } from "./TicketTable";

export function BulkActionBar({
  count,
  onClear,
  onSetPoStatus,
  onRefreshFromJira,
  onReviewStory,
  isRefreshing,
}: {
  count: number;
  onClear: () => void;
  onSetPoStatus: (status: POStatus) => void;
  onRefreshFromJira: () => void;
  onReviewStory: () => void;
  isRefreshing: boolean;
}) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setShowStatusDropdown(false);
    }
    if (showStatusDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showStatusDropdown]);

  return (
    <div className="flex items-center gap-3 border-t border-white/[0.06] bg-[var(--color-brand-600)]/8 px-5 py-2.5">
      <span className="text-xs font-medium text-white/60">
        {count} selected
      </span>
      <div className="h-3.5 w-px bg-white/[0.08]" />
      <div ref={statusRef} className="relative">
        <button
          type="button"
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
        >
          Set PO Status
        </button>
        {showStatusDropdown && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-52 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {PO_STATUS_OPTIONS.map((opt) => {
              const optColors = opt.value ? PO_STATUS_COLORS[opt.value] : null;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    onSetPoStatus(opt.value);
                    setShowStatusDropdown(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-white/60 cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06]"
                >
                  <span style={{ color: optColors?.text || "rgba(255,255,255,0.25)" }}>
                    <POStatusIcon status={opt.value} size={13} />
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={isRefreshing}
        onClick={onRefreshFromJira}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isRefreshing ? "Syncing..." : "Refresh from Jira"}
      </button>
      <button
        type="button"
        onClick={onReviewStory}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
      >
        Review Story
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-white/30 cursor-pointer hover:text-white/50"
      >
        Clear
      </button>
    </div>
  );
}
