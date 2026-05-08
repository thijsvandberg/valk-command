"use client";

import type { StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import { Info, CloudUpload, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  changeHunkCount: number;
  decidedCount: number;
}

export interface DiffViewerProps {
  compareOldVersion: StoryVersion;
  compareNewVersion: StoryVersion;
  compareOld: number | null;
  compareNew: number | null;
  oldOptions: VersionOption[];
  newOptions: VersionOption[];
  loadingContent: boolean;
  isConflictView: boolean;
  metadataOnlyConflict?: boolean;
  resolving: boolean;
  savingMerge: boolean;
  mergeResult: string | null;
  diffStats: DiffStats | null;
  onOldChange: (val: number) => void;
  onNewChange: (val: number) => void;
  onResultChange: (result: string | null) => void;
  onStatsComputed: (stats: DiffStats | null) => void;
  onKeepAndPush: () => void;
  onForcePush: () => void;
  onDiscardLocal: () => void;
  onSaveMerge: () => void;
  onRevertTo: (version: StoryVersion) => void;
}

export function DiffViewer({
  compareOldVersion,
  compareNewVersion,
  compareOld,
  compareNew,
  oldOptions,
  newOptions,
  loadingContent,
  isConflictView,
  metadataOnlyConflict,
  resolving,
  savingMerge,
  mergeResult,
  diffStats,
  onOldChange,
  onNewChange,
  onResultChange,
  onStatsComputed,
  onKeepAndPush,
  onForcePush,
  onDiscardLocal,
  onSaveMerge,
  onRevertTo,
}: DiffViewerProps) {
  const compareBar = (
    <div className="flex items-center gap-2">
      <VersionPicker
        options={oldOptions}
        selectedId={compareOld !== null ? String(compareOld) : ""}
        onSelect={(id) => onOldChange(Number(id))}
      />
      <span className="shrink-0 text-xs text-text-muted">vs</span>
      <VersionPicker
        options={newOptions}
        selectedId={compareNew !== null ? String(compareNew) : ""}
        onSelect={(id) => onNewChange(Number(id))}
      />
    </div>
  );

  const draftInvolved =
    compareOldVersion?.label === "draft" || compareNewVersion?.label === "draft";
  const currentJiraInvolved =
    compareOldVersion?.label === "current" || compareNewVersion?.label === "current";
  const showConflictActions = draftInvolved && currentJiraInvolved;
  const showRevertActions = !draftInvolved && !!compareOldVersion && !!compareNewVersion;

  const showFooter = mergeResult !== null || showConflictActions || showRevertActions;

  return (
    <>
      {/* Compare bar */}
      <div className="mb-3 flex items-center justify-between">
        {compareBar}
        {diffStats && (
          <div className="flex items-center gap-3 text-xs">
            {diffStats.changeHunkCount > 0 && (
              <span className="text-text-tertiary">
                {diffStats.decidedCount}/{diffStats.changeHunkCount} reviewed
              </span>
            )}
            {diffStats.added > 0 && (
              <span className="flex items-center gap-1" style={{ color: "#3fb950" }}>
                <span className="font-mono font-semibold">+{diffStats.added}</span>
                <span className="text-text-tertiary">added</span>
              </span>
            )}
            {diffStats.removed > 0 && (
              <span className="flex items-center gap-1" style={{ color: "#e5534b" }}>
                <span className="font-mono font-semibold">&minus;{diffStats.removed}</span>
                <span className="text-text-tertiary">removed</span>
              </span>
            )}
            {diffStats.modified > 0 && (
              <span className="flex items-center gap-1" style={{ color: "#d2a8ff" }}>
                <span className="font-mono font-semibold">~{diffStats.modified}</span>
                <span className="text-text-tertiary">modified</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Metadata-only change notification with force push */}
      {isConflictView && metadataOnlyConflict && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-600)]/[0.06] px-4 py-3">
          <Info size={16} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text-secondary">No content changes detected</p>
            <p className="mt-0.5 text-label text-text-tertiary">
              Jira was updated (e.g. status transition, comment, or field change) but the description content is unchanged.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            disabled={resolving}
            onClick={onForcePush}
            className="shrink-0"
            icon={<CloudUpload size={13} strokeWidth={1.5} />}
          >
            {resolving ? "Pushing..." : "Push to Jira"}
          </Button>
        </div>
      )}

      {loadingContent ? (
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-overlay-subtle" style={{ width: `${70 + i * 8}%` }} />
          ))}
        </div>
      ) : (
        <StoryDiff
          oldText={compareOldVersion.content}
          newText={compareNewVersion.content}
          mode="unified"
          interactive
          onResultChange={onResultChange}
          onStatsComputed={onStatsComputed}
        />
      )}

      {/* Sticky combined action footer */}
      {showFooter && (
        <div
          className="sticky bottom-0 mt-4 flex items-center gap-4 border-t border-border-default bg-[var(--color-surface-base)]/95 px-0 py-4 backdrop-blur-sm"
          style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.20)" }}
        >
          {showConflictActions && (
            <>
              <Button
                variant="ghost"
                size="md"
                disabled={resolving}
                onClick={onDiscardLocal}
              >
                {resolving ? "Accepting..." : "Accept Jira version"}
              </Button>
              <Button
                variant="destructive"
                size="md"
                disabled={resolving}
                onClick={metadataOnlyConflict ? onForcePush : onKeepAndPush}
                className="!border !border-red-500/20 !bg-red-500/[0.08] hover:!bg-red-500/[0.15]"
              >
                {resolving ? "Pushing..." : "Overwrite Jira with your draft"}
              </Button>
            </>
          )}
          {showRevertActions && (
            <span className="text-xs text-text-tertiary">Revert:</span>
          )}

          {mergeResult !== null && !showConflictActions && (
            <span className="text-xs text-text-secondary">Apply merge selections as local edit</span>
          )}

          <div className="flex-1" />

          {mergeResult !== null && (
            <Button
              variant="primary"
              size="md"
              disabled={savingMerge}
              onClick={onSaveMerge}
              icon={<Save size={13} strokeWidth={1.5} />}
            >
              {savingMerge ? "Applying..." : "Apply merge"}
            </Button>
          )}
          {showRevertActions && compareOldVersion && (
            <Button
              variant="ghost"
              size="md"
              disabled={resolving}
              onClick={() => onRevertTo(compareOldVersion)}
            >
              {resolving ? "Reverting..." : `Revert to v${compareOldVersion.versionNumber}`}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
