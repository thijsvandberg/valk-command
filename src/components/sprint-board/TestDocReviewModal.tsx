"use client";

import { Modal } from "@/components/shared/Modal";
import { ModalHeader } from "@/components/shared/ModalHeader";
import { Button } from "@/components/ui/Button";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { TestDocStoryPane } from "@/components/sprint-board/TestDocStoryPane";
import { TestDocReviewPane } from "@/components/sprint-board/TestDocReviewPane";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError } from "@/lib/agent-errors";
import { usePersistedSplit } from "@/components/sprint-board/usePersistedSplit";
import { useTestDocReview } from "@/components/sprint-board/useTestDocReview";
import { ArrowLeft, ClipboardCheck, RefreshCw } from "lucide-react";

const SPLIT_STORAGE_KEY = "bridge:test-doc-split";
const SPLIT_MIN = 30;
const SPLIT_MAX = 70;

/** Invisible per-task SSE subscriber; unmounts (closing the stream) once its entry resolves. */
function TaskStreamWatcher({
  taskId,
  onProgress,
  onResult,
  onError,
}: {
  taskId: string;
  onProgress: (message: string) => void;
  onResult: (output: string) => void;
  onError: (message: string) => void;
}) {
  useTaskStream(taskId, {
    timeout: 0,
    onProgress,
    onToolCall: (tool) => onProgress(`Using ${tool.replace("mcp__", "")}...`),
    onResult: (resultData) => onResult((resultData.output as string) ?? ""),
    onError: (message) => onError(friendlyStreamError(message)),
    onNetworkError: () => onError("Connection to workspace lost"),
  });
  return null;
}

interface TestDocReviewModalProps {
  /** Queue of ticket keys to generate + validate; a single key is the non-bulk case. */
  keys: string[];
  /** Set when opened FROM the sprint bundle: closing returns there, and the
   *  footer says so instead of a bare Cancel. */
  returnsToBundle?: boolean;
  /**
   * When false (the "view" entry points: row marker, status line), a key
   * without any cached doc opens IDLE with an explicit Generate button —
   * opening the modal must not silently start an agent task. Explicit
   * generate actions (bulk toolbar, context menu, generate-missing) pass true.
   */
  autoGenerate?: boolean;
  onClose: () => void;
}

/**
 * Split-view validation for generated stakeholder test docs (BRDG-426).
 * Left: the editable generated markdown. Right: the story rendered in the
 * regular ticket format, so the PO validates with the story actually visible.
 *
 * Bulk mode prefetches: all generations start immediately (rolling, capped),
 * the first result shows as soon as it lands, and the rest generate while the
 * PO reviews — advancing to an already-finished doc is instant. All the state
 * lives in {@link useTestDocReview}; this component is layout + wiring.
 */
export function TestDocReviewModal({ keys, autoGenerate = true, returnsToBundle = false, onClose }: TestDocReviewModalProps) {
  // Adjustable pane split (PO preference varies per story length); persisted.
  const { splitPct, splitRef, handleSplitDrag } = usePersistedSplit(SPLIT_STORAGE_KEY, {
    min: SPLIT_MIN,
    max: SPLIT_MAX,
  });
  const {
    currentKey,
    entry,
    index,
    isBulk,
    isLast,
    detail,
    entries,
    progressByKey,
    handleProgress,
    handleTaskResult,
    handleTaskError,
    saving,
    conflictMessage,
    compare,
    setCompare,
    editing,
    setEditing,
    generating,
    docIsStale,
    readyAhead,
    saveDisabled,
    handleClose,
    advance,
    handleSave,
    handleNotNeeded,
    handleRegenerate,
    handleSwitchVersion,
    handleDocChange,
  } = useTestDocReview({ keys, autoGenerate, onClose });

  if (!currentKey || !entry) return null;

  return (
    <Modal open onClose={handleClose} aria-label={`Test documentation for ${currentKey}`}>
      {/* Background prefetch streams; each unmounts when its entry resolves. */}
      {keys.map((key) => {
        const e = entries[key];
        if (!e || e.status !== "generating" || !e.taskId) return null;
        return (
          <TaskStreamWatcher
            key={e.taskId}
            taskId={e.taskId}
            onProgress={(message) => handleProgress(key, message)}
            onResult={(output) => handleTaskResult(key, output)}
            onError={(message) => handleTaskError(key, message)}
          />
        );
      })}
      {/* data-autofocus: the modal focuses the card itself on open — the first
          focusable element is the header's ticket pill, which would otherwise
          pop its hover card immediately. */}
      <div
        data-autofocus
        tabIndex={-1}
        className="flex h-[min(1040px,90vh)] w-[min(1680px,95vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl outline-none"
      >
        <ModalHeader
          icon={<ClipboardCheck size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />}
          title="Test documentation"
          // The key lives ONCE, here in the header, as the regular ticket pill
          // (status + hover card + open in new tab).
          subtitle={
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <TicketRefPill ticketKey={currentKey} />
              <span className="truncate text-body-sm text-text-tertiary">{detail?.title ?? ""}</span>
            </div>
          }
          trailing={
            isBulk ? (
              <span
                data-testid="test-doc-queue-position"
                className="rounded-md bg-overlay-subtle px-2 py-0.5 font-mono text-body-sm text-text-tertiary"
              >
                {index + 1} / {keys.length}
                {readyAhead > 0 && (
                  <span className="text-text-muted"> &middot; {readyAhead} ready</span>
                )}
              </span>
            ) : undefined
          }
          onClose={handleClose}
        />

        {/* Body: doc left, story right; the divider drags to resize (persisted). */}
        <div ref={splitRef} className="flex min-h-0 flex-1">
          <TestDocReviewPane
            entry={entry}
            splitPct={splitPct}
            generating={generating}
            docIsStale={docIsStale}
            conflictMessage={conflictMessage}
            compare={compare}
            editing={editing}
            progress={progressByKey[currentKey]}
            onSwitchVersion={handleSwitchVersion}
            onToggleCompare={() => { setCompare((c) => !c); setEditing(false); }}
            onToggleEdit={() => { setEditing((e) => !e); setCompare(false); }}
            onGenerate={handleRegenerate}
            onDocChange={handleDocChange}
            onPreviewClick={() => setEditing(true)}
          />

          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={handleSplitDrag}
            className="w-1 shrink-0 cursor-col-resize bg-border-subtle transition-colors duration-150 hover:bg-[var(--color-brand-500)]/40"
          />
          {/* The story is pinned reference, so it sits on a recessed plane (base
              vs the elevated work surface on the left) — reads as "validate the
              doc against the story" in both themes. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border-subtle bg-surface-base p-5">
            <TestDocStoryPane detail={detail} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button
            variant="ghost"
            size="md"
            onClick={handleClose}
            icon={returnsToBundle ? <ArrowLeft size={12} strokeWidth={2} /> : undefined}
          >
            {returnsToBundle ? "Back to sprint doc" : "Cancel"}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={handleNotNeeded}
            disabled={saving}
            title="Mark this ticket as needing no test documentation — it moves to a separate list in the sprint bundle and is never flagged as missing again"
          >
            No test doc needed
          </Button>
          {isBulk && (
            <Button variant="ghost" size="md" onClick={advance} disabled={saving}>
              Skip
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={handleRegenerate}
            disabled={generating || saving}
            icon={<RefreshCw size={12} strokeWidth={2} />}
          >
            Regenerate
          </Button>
          {conflictMessage ? (
            <Button variant="primary" size="md" onClick={advance}>
              {isLast ? "Done" : "Next"}
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={handleSave} disabled={saveDisabled}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
