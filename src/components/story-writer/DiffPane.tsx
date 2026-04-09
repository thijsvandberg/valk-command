"use client";

import { useState, useRef } from "react";
import {
  GitCompare, Trash2, Check,
  ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { StoryDiff, type HunkState, type StoryDiffHandle } from "@/components/story-diff/StoryDiff";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";

export type DiffViewMode = "diff" | "plain";

export interface RightVersion extends VersionOption {
  content: string;
  isDraft?: boolean;
  draftDbId?: string;
}

export interface StoredVersionRow {
  id: string;
  description: string;
  createdAt: string;
  updatedBy: string | null;
  updatedByAvatar: string | null;
  contentHash: string;
}

export interface DiffPaneProps {
  baseSnapshot: string;
  rightVersions: RightVersion[];
  diffNewId: string;
  diffViewMode: DiffViewMode;
  hunkStates: Record<number, HunkState>;
  selectedDraftIdx: number;
  totalDrafts: number;
  snapshotKey: number;
  onDiffNewIdChange: (id: string) => void;
  onDiffViewModeChange: (m: DiffViewMode) => void;
  onHunkStatesChange: (s: Record<number, HunkState>) => void;
  onResultChange: (text: string) => void;
  onNavigateDraft: (dir: -1 | 1) => void;
  onDismissDraft: (draftDbId: string) => void;
}

export function DiffPane({
  baseSnapshot,
  rightVersions,
  diffNewId,
  diffViewMode,
  hunkStates,
  selectedDraftIdx,
  totalDrafts,
  snapshotKey,
  onDiffNewIdChange,
  onDiffViewModeChange,
  onHunkStatesChange,
  onResultChange,
  onNavigateDraft,
  onDismissDraft,
}: DiffPaneProps) {
  const selected = rightVersions.find((v) => v.id === diffNewId);
  const isAiDraft = selected?.isDraft ?? false;
  const diffRef = useRef<StoryDiffHandle>(null);
  const [diffStats, setDiffStats] = useState<{ changeHunkCount: number; decidedCount: number } | null>(null);

  const pendingHunkCount = diffStats ? diffStats.changeHunkCount - diffStats.decidedCount : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-3">
        <VersionPicker
          options={rightVersions}
          selectedId={diffNewId}
          onSelect={onDiffNewIdChange}
        />

        <div className="ml-auto flex items-center gap-2">
          {diffViewMode === "plain" ? (
            <button
              type="button"
              onClick={() => onDiffViewModeChange("diff")}
              title="Show diff"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer text-white/35 hover:text-white/55 hover:bg-white/[0.04] transition-colors duration-150"
            >
              <GitCompare size={11} strokeWidth={1.5} />
              Diff
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDiffViewModeChange("plain")}
              title="Preview the selected version"
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer text-white/35 hover:text-white/55 hover:bg-white/[0.04] transition-colors duration-150"
            >
              <Eye size={11} strokeWidth={1.5} />
              Preview
            </button>
          )}
        </div>
      </div>

      {isAiDraft && totalDrafts > 0 && (
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={selectedDraftIdx === 0}
              onClick={() => onNavigateDraft(-1)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <span className="text-xs text-white/45">
              AI Draft {selectedDraftIdx + 1} of {totalDrafts}
            </span>
            <button
              type="button"
              disabled={selectedDraftIdx === totalDrafts - 1}
              onClick={() => onNavigateDraft(1)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/40 cursor-pointer hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingHunkCount > 0 && (
              <button
                type="button"
                onClick={() => diffRef.current?.acceptAll()}
                className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/25 active:scale-95 transition-transform duration-150"
              >
                <Check size={11} strokeWidth={2} />
                Accept {pendingHunkCount} remaining
              </button>
            )}
            <button
              type="button"
              onClick={() => selected?.draftDbId && onDismissDraft(selected.draftDbId)}
              title="Remove this AI draft"
              className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/40 border border-white/[0.06] cursor-pointer hover:text-red-400/70 hover:bg-red-500/[0.06] active:scale-95 transition-transform duration-150"
            >
              <Trash2 size={11} strokeWidth={2} />
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-white/25">
            {rightVersions.length === 0 ? "No versions to compare" : "Select a version"}
          </div>
        ) : (
          <>
            {diffViewMode === "plain" && (
              <div className="description-content px-1 py-2">
                {renderMarkdown(selected.content)}
              </div>
            )}
            <div className={diffViewMode === "plain" ? "hidden" : ""}>
              <StoryDiff
                ref={diffRef}
                key={`${diffNewId}-${snapshotKey}`}
                oldText={baseSnapshot}
                newText={selected.content}
                oldLabel="Current"
                newLabel={selected.label}
                interactive
                pendingIsOld
                onResultChange={onResultChange}
                hunkStates={hunkStates}
                onHunkStatesChange={onHunkStatesChange}
                onStatsComputed={setDiffStats}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
