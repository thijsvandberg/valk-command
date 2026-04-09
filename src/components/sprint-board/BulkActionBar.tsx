"use client";

import { useState, useRef, useEffect } from "react";
import type { POStatus } from "@/types/ticket";
import { PO_STATUS_OPTIONS } from "@/types/ticket";
import { PO_STATUS_COLORS } from "./FilterBar";
import { POStatusIcon } from "./TicketTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { Copy, Check } from "lucide-react";

export function BulkActionBar({
  count,
  onClear,
  onSetPoStatus,
  onRefreshFromJira,
  onReviewStory,
  onCopyToClipboard,
  isRefreshing,
}: {
  count: number;
  onClear: () => void;
  onSetPoStatus: (status: POStatus) => void;
  onRefreshFromJira: () => void;
  onReviewStory: () => void;
  onCopyToClipboard: () => void;
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
        <Button
          variant="ghost"
          size="md"
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className="border-0 text-white/60 hover:text-white"
        >
          Set PO Status
        </Button>
        {showStatusDropdown && (
          <Card variant="floating" className="absolute bottom-full left-0 z-50 mb-1 w-52 py-1">
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
          </Card>
        )}
      </div>
      <Button
        variant="ghost"
        size="md"
        disabled={isRefreshing}
        onClick={onRefreshFromJira}
        className="border-0 text-white/60 hover:text-white"
      >
        {isRefreshing ? "Syncing..." : "Refresh from Jira"}
      </Button>
      <Button
        variant="ghost"
        size="md"
        onClick={onReviewStory}
        className="border-0 text-white/60 hover:text-white"
      >
        Review Story
      </Button>
      <Button
        variant="ghost"
        size="md"
        onClick={onCopyToClipboard}
        className="border-0 text-white/60 hover:text-white"
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
        Copy
      </Button>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="border-0 bg-transparent text-white/30 hover:text-white/50 hover:bg-transparent"
      >
        Clear
      </Button>
    </div>
  );
}
