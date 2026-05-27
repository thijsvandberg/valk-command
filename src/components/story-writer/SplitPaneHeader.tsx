"use client";

import Link from "next/link";
import { FileText, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SplitPaneHeaderProps {
  ticketKey: string;
  title: string;
  slot: "original" | "target";
  collapseIcon: React.ReactNode;
  onCollapse: () => void;
  collapseTitle: string;
  showOriginalButton?: boolean;
  onShowOriginal?: () => void;
  showTargetButton?: boolean;
  onShowTarget?: () => void;
  paneView?: "editor" | "diff";
  onPaneViewChange?: (v: "editor" | "diff") => void;
  hasDrafts?: boolean;
}

export function SplitPaneHeader({
  ticketKey,
  title,
  slot,
  collapseIcon,
  onCollapse,
  collapseTitle,
  showOriginalButton,
  onShowOriginal,
  showTargetButton,
  onShowTarget,
  paneView,
  onPaneViewChange,
  hasDrafts,
}: SplitPaneHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border-default bg-[var(--color-surface-elevated)]/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/tickets/${ticketKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-body-sm font-semibold text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150"
          >
            {ticketKey}
          </Link>
          <span
            className={`rounded px-1.5 py-0.5 text-caption font-medium ${
              slot === "original"
                ? "bg-overlay-default text-text-tertiary"
                : "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]/70"
            }`}
          >
            {slot === "original" ? "Original" : "Split target"}
          </span>
        </div>
        <p className="truncate text-body-sm text-text-secondary leading-tight mt-0.5">{title}</p>
      </div>

      <div className="flex items-center gap-1">
        {onPaneViewChange && (
          <div className="flex items-center gap-0.5 rounded-md bg-overlay-subtle p-0.5">
            <button
              type="button"
              onClick={() => onPaneViewChange("editor")}
              title="Editor"
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-label font-medium cursor-pointer transition-colors duration-150 ${
                paneView === "editor"
                  ? "bg-[var(--color-surface-floating)] text-text-secondary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <FileText size={11} strokeWidth={1.5} />
              Editor
            </button>
            <button
              type="button"
              onClick={() => onPaneViewChange("diff")}
              title="Diff"
              className={`relative flex items-center gap-1 rounded px-2 py-0.5 text-label font-medium cursor-pointer transition-colors duration-150 ${
                paneView === "diff"
                  ? "bg-[var(--color-surface-floating)] text-text-secondary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <GitCompare size={11} strokeWidth={1.5} />
              Diff
              {hasDrafts && paneView !== "diff" && (
                <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
              )}
            </button>
          </div>
        )}

        {showOriginalButton && onShowOriginal && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowOriginal}
            title="Show original story"
            className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
          >
            Show original
          </Button>
        )}
        {showTargetButton && onShowTarget && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowTarget}
            title="Show split target story"
            className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
          >
            Show target
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={collapseIcon}
          onClick={onCollapse}
          title={collapseTitle}
          aria-label={collapseTitle}
          className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-overlay-default"
        />
      </div>
    </div>
  );
}
