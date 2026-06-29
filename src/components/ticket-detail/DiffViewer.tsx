"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import { Info, CloudUpload, Save, Eye } from "lucide-react";
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
  onPreview: (versionNumber: number) => void;
  /** Id of the sticky footer portal. Override for a panel instance sharing the page. */
  portalId?: string;
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
  onPreview,
  portalId = "diff-footer-portal",
}: DiffViewerProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById(portalId));
  }, [portalId]);

  // The footer is portaled full-width; match the surrounding content rail so it
  // stays aligned and does not waste space in the narrow side panel.
  const compact = portalId.endsWith("-panel");

  const compareBar = (
    <div className="flex items-center gap-2">
      <VersionPicker
        options={oldOptions}
        selectedId={compareOld !== null ? String(compareOld) : ""}
        onSelect={(id) => onOldChange(Number(id))}
      />
      <button
        onClick={() => compareOld !== null && onPreview(compareOld)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-overlay-default hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title={`Preview v${compareOld}`}
      >
        <Eye size={13} strokeWidth={1.5} />
      </button>
      <span className="shrink-0 text-body-sm text-text-muted">vs</span>
      <VersionPicker
        options={newOptions}
        selectedId={compareNew !== null ? String(compareNew) : ""}
        onSelect={(id) => onNewChange(Number(id))}
      />
      <button
        onClick={() => compareNew !== null && onPreview(compareNew)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-overlay-default hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title={`Preview v${compareNew}`}
      >
        <Eye size={13} strokeWidth={1.5} />
      </button>
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
          <div className="flex items-center gap-3 text-body-sm">
            {diffStats.changeHunkCount > 0 && (
              <span className="text-text-tertiary">
                {diffStats.decidedCount}/{diffStats.changeHunkCount} reviewed
              </span>
            )}
            {diffStats.added > 0 && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-diff-added-gutter)" }}>
                <span className="font-mono font-semibold">+{diffStats.added}</span>
                <span className="text-text-tertiary">added</span>
              </span>
            )}
            {diffStats.removed > 0 && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-diff-deleted-gutter)" }}>
                <span className="font-mono font-semibold">&minus;{diffStats.removed}</span>
                <span className="text-text-tertiary">removed</span>
              </span>
            )}
            {diffStats.modified > 0 && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-diff-modified-badge)" }}>
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
            <p className="text-body-sm font-medium text-text-secondary">No content changes detected</p>
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

      {/* Action footer: portaled to sit outside max-w container, full-width sticky */}
      {showFooter && portalTarget && createPortal(
        <div
          className={`diff-action-footer flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-default bg-surface-elevated/95 backdrop-blur-sm ${compact ? "px-5 py-2.5" : "px-8 py-4"}`}
        >
          {mergeResult !== null && !showConflictActions && (
            <span className="min-w-0 flex-1 text-body-sm text-text-secondary">
              Apply merge selections as local edit
            </span>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2 ms-auto">
            {showConflictActions && (
              <>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={resolving}
                  onClick={onDiscardLocal}
                  className="whitespace-nowrap"
                >
                  {resolving ? "Accepting..." : "Accept Jira version"}
                </Button>
                <Button
                  variant="destructive"
                  size="md"
                  disabled={resolving}
                  onClick={metadataOnlyConflict ? onForcePush : onKeepAndPush}
                  className="whitespace-nowrap !border !border-red-500/20 !bg-red-500/[0.08] hover:!bg-red-500/[0.15]"
                >
                  {resolving ? "Pushing..." : "Overwrite Jira with your draft"}
                </Button>
              </>
            )}
            {mergeResult !== null && (
              <Button
                variant="primary"
                size="md"
                disabled={savingMerge}
                onClick={onSaveMerge}
                icon={<Save size={13} strokeWidth={1.5} />}
                className="whitespace-nowrap"
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
                className="whitespace-nowrap"
              >
                {resolving ? "Reverting..." : `Revert to v${compareOldVersion.versionNumber}`}
              </Button>
            )}
          </div>
        </div>,
        portalTarget,
      )}
    </>
  );
}
