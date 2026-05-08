"use client";

import { useState, useRef } from "react";
import {
  GitCompare, Trash2, Check,
  ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { StoryDiff, type HunkState, type StoryDiffHandle } from "@/components/story-diff/StoryDiff";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";
import { Button } from "@/components/ui/Button";

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
  /** When false, skip the internal version picker + diff/preview toggle row. Default: true */
  showHeader?: boolean;
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
  showHeader = true,
}: DiffPaneProps) {
  const selected = rightVersions.find((v) => v.id === diffNewId);
  const isAiDraft = selected?.isDraft ?? false;
  const diffRef = useRef<StoryDiffHandle>(null);
  const [diffStats, setDiffStats] = useState<{ changeHunkCount: number; decidedCount: number } | null>(null);

  const pendingHunkCount = diffStats ? diffStats.changeHunkCount - diffStats.decidedCount : 0;

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <div className="flex h-10 items-center gap-2 border-b border-border-default px-3">
          <VersionPicker
            options={rightVersions}
            selectedId={diffNewId}
            onSelect={onDiffNewIdChange}
          />

          <div className="ml-auto flex items-center gap-2">
            {diffViewMode === "plain" ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<GitCompare size={11} strokeWidth={1.5} />}
                onClick={() => onDiffViewModeChange("diff")}
                title="Show diff"
                className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
              >
                Diff
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon={<Eye size={11} strokeWidth={1.5} />}
                onClick={() => onDiffViewModeChange("plain")}
                title="Preview the selected version"
                className="border-0 bg-transparent text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
              >
                Preview
              </Button>
            )}
          </div>
        </div>
      )}

      {isAiDraft && totalDrafts > 0 && (
        <div className="flex items-center justify-between border-b border-border-default bg-overlay-subtle px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<ChevronLeft size={14} strokeWidth={1.5} />}
              disabled={selectedDraftIdx === 0}
              onClick={() => onNavigateDraft(-1)}
              className="border-0 bg-transparent text-text-tertiary"
            />
            <span className="text-xs text-text-tertiary">
              AI Draft {selectedDraftIdx + 1} of {totalDrafts}
            </span>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<ChevronRight size={14} strokeWidth={1.5} />}
              disabled={selectedDraftIdx === totalDrafts - 1}
              onClick={() => onNavigateDraft(1)}
              className="border-0 bg-transparent text-text-tertiary"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {pendingHunkCount > 0 && (
              <Button
                variant="soft"
                size="sm"
                icon={<Check size={11} strokeWidth={2} />}
                onClick={() => diffRef.current?.acceptAll()}
              >
                Accept {pendingHunkCount} remaining
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={11} strokeWidth={2} />}
              onClick={() => selected?.draftDbId && onDismissDraft(selected.draftDbId)}
              title="Remove this AI draft"
              className="hover:text-red-400/70 hover:bg-red-500/[0.06]"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
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
