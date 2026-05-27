"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StoryDiff } from "./StoryDiff";
import type { DiffMode } from "./StoryDiff";
import type { StoryVersion } from "@/types/ticket";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface StoryDiffPanelProps {
  versions: StoryVersion[];
  onBack: () => void;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatDate(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(raw);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export function StoryDiffPanel({ versions, onBack }: StoryDiffPanelProps) {
  // Index into the versions array for the "new" version being shown.
  // 0 = most recent version (versions are newest-first by convention).
  // We compare selectedIdx with selectedIdx + 1 (the previous version).
  const sorted = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  // Navigate to an older diff pair (higher index = older)
  const canPrev = selectedIdx < sorted.length - 2;
  // Navigate to a newer diff pair (lower index = newer)
  const canNext = selectedIdx > 0;

  const handlePrev = useCallback(() => {
    if (canPrev) setSelectedIdx((i) => i + 1);
  }, [canPrev]);

  const handleNext = useCallback(() => {
    if (canNext) setSelectedIdx((i) => i - 1);
  }, [canNext]);

  // Keyboard shortcuts: arrows / j/k for navigation, Escape to go back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        if (canNext) setSelectedIdx((i) => i - 1);
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        if (canPrev) setSelectedIdx((i) => i + 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canPrev, canNext, onBack]);

  const current = sorted[selectedIdx];
  const previous = sorted[selectedIdx + 1] ?? null;

  const isFirstVersion = previous === null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={14} className="text-text-tertiary" strokeWidth={1.5} />}
          onClick={onBack}
        >
          Back
        </Button>

        <div className="flex items-center gap-1">
          {/* Diff mode toggle */}
          <div className="mr-2 flex items-center overflow-hidden rounded-md border border-border-strong">
            <button
              type="button"
              onClick={() => setDiffMode("unified")}
              title="Unified diff view"
              className={`px-2.5 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "unified"
                  ? "bg-overlay-strong text-text-secondary"
                  : "text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setDiffMode("side-by-side")}
              title="Side-by-side diff view"
              className={`border-l border-border-strong px-2.5 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "side-by-side"
                  ? "bg-overlay-strong text-text-secondary"
                  : "text-text-tertiary hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Split
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={!canPrev}
            title="Previous version (Left arrow / k)"
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={!canNext}
            title="Next version (Right arrow / j)"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Version info */}
      <div className="border-b border-border-default px-4 py-3">
        <p className="font-[var(--font-body)] text-body-lg text-text-secondary">
          {isFirstVersion
            ? `Version ${current.versionNumber} (initial)`
            : `Version ${previous!.versionNumber} \u2192 Version ${current.versionNumber}`}
        </p>
        <div className="mt-1 flex items-center gap-3 text-body-sm text-text-tertiary">
          <span>{formatDate(current.date)}</span>
          {current.updatedBy && (
            <span className="text-text-tertiary">{current.updatedBy}</span>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isFirstVersion ? (
          <div>
            <p className="mb-2 text-body-sm font-medium text-text-tertiary">Initial version</p>
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border-default bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-body-lg leading-[1.7] text-text-primary whitespace-pre-wrap">
              {current.content || <span className="text-text-tertiary">No content</span>}
            </div>
          </div>
        ) : (
          <StoryDiff
            oldText={previous!.content}
            newText={current.content}
            oldLabel={`v${previous!.versionNumber}`}
            newLabel={`v${current.versionNumber}`}
            mode={diffMode}
          />
        )}
      </div>

      {/* Keyboard hint */}
      <div className="border-t border-border-default px-4 py-2">
        <p className="text-caption text-text-muted">
          Use arrow keys or j/k to navigate, Esc to go back
        </p>
      </div>
    </div>
  );
}
