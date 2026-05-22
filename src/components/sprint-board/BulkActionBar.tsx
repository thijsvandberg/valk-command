"use client";

import { useState, useRef, useEffect } from "react";
import type { TicketReadiness } from "@/types/ticket";
import { READINESS_OPTIONS, READINESS_CONFIG } from "@/types/ticket";
import { ReadinessIcon } from "@/components/shared/ReadinessCell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { Copy, FileText, Loader2, Layers } from "lucide-react";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";

export function BulkActionBar({
  count,
  selectedPoints,
  allChecked,
  totalCount,
  onToggleAll,
  onClear,
  onSetReadiness,
  onRefreshFromJira,
  onReviewStory,
  onCopyToClipboard,
  onExportForStakeholders,
  onRefine,
  isRefreshing,
  isExporting,
}: {
  count: number;
  selectedPoints?: number;
  allChecked?: boolean;
  totalCount?: number;
  onToggleAll?: () => void;
  onClear: () => void;
  onSetReadiness?: (readiness: TicketReadiness | null) => void;
  onRefreshFromJira?: () => void;
  onReviewStory?: () => void;
  onCopyToClipboard?: () => void;
  onExportForStakeholders?: () => void;
  onRefine?: () => void;
  isRefreshing?: boolean;
  isExporting?: boolean;
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
    <BarContainer borderPosition="top" className="sticky bottom-0 z-20 gap-3 bg-[var(--color-surface-base)]">
      {/* Select all / deselect all checkbox */}
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="flex items-center justify-center cursor-pointer"
          title={allChecked ? "Deselect all" : "Select all"}
        >
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
              allChecked
                ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                : "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
            }`}
          >
            {allChecked ? (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="h-1.5 w-1.5 rounded-sm bg-[var(--color-brand-400)]" />
            )}
          </span>
        </button>
      )}

      <span className="text-xs font-medium text-text-secondary">
        {count}{totalCount ? `/${totalCount}` : ""} selected
        {selectedPoints !== undefined && selectedPoints > 0 && (
          <span className="ml-1 text-text-tertiary">&middot; {selectedPoints} pts</span>
        )}
      </span>
      <BarDivider />
      {onSetReadiness && (
        <div ref={statusRef} className="relative">
          <Button
            variant="ghost"
            size="md"
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            className="border-0 text-text-secondary hover:text-text-primary"
          >
            Set Readiness
          </Button>
          {showStatusDropdown && (
            <Card variant="floating" className="absolute bottom-full left-0 z-50 mb-1 w-52 py-1">
              {READINESS_OPTIONS.map((opt) => {
                const cfg = opt.value ? READINESS_CONFIG[opt.value] : null;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      onSetReadiness(opt.value);
                      setShowStatusDropdown(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text-secondary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    <span
                      className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full"
                      style={{
                        color: cfg?.color ?? "var(--color-text-muted)",
                        backgroundColor: cfg?.bg ?? "var(--color-overlay-default)",
                      }}
                    >
                      {opt.value && <ReadinessIcon value={opt.value} size={10} />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </Card>
          )}
        </div>
      )}
      {onRefreshFromJira && (
        <Button
          variant="ghost"
          size="md"
          disabled={isRefreshing}
          onClick={onRefreshFromJira}
          className="border-0 text-text-secondary hover:text-text-primary"
        >
          {isRefreshing ? "Syncing..." : "Refresh from Jira"}
        </Button>
      )}
      {onReviewStory && (
        <Button
          variant="ghost"
          size="md"
          onClick={onReviewStory}
          className="border-0 text-text-secondary hover:text-text-primary"
        >
          Review Story
        </Button>
      )}
      {onCopyToClipboard && (
        <Button
          variant="ghost"
          size="md"
          onClick={onCopyToClipboard}
          className="border-0 text-text-secondary hover:text-text-primary"
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Copy
        </Button>
      )}
      {onExportForStakeholders && (
        <Button
          variant="ghost"
          size="md"
          disabled={isExporting}
          onClick={onExportForStakeholders}
          className="border-0 text-text-secondary hover:text-text-primary"
        >
          {isExporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <FileText className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      )}
      {onRefine && (
        <Button
          variant="soft"
          size="md"
          onClick={onRefine}
        >
          <Layers className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Refine
        </Button>
      )}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-transparent"
      >
        Clear
      </Button>
    </BarContainer>
  );
}
