"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import type { EntryState } from "@/components/sprint-board/useTestDocReview";

interface TestDocReviewPaneProps {
  entry: EntryState;
  /** Width of this (left) pane as a percentage; the story pane fills the rest. */
  splitPct: number;
  generating: boolean;
  docIsStale: boolean;
  conflictMessage: string | null;
  compare: boolean;
  editing: boolean;
  /** progressByKey for the on-screen key. */
  progress: string | undefined;
  onSwitchVersion: (index: number) => void;
  onToggleCompare: () => void;
  onToggleEdit: () => void;
  onGenerate: () => void;
  onDocChange: (value: string) => void;
  onPreviewClick: () => void;
}

/**
 * The left half of the test-doc review modal (BRDG-426): the stack of context
 * alerts, the version/compare/edit toolbar, and the doc body itself — idle,
 * generating, compare, editor and rendered-preview states. Pure presentation;
 * all state lives in {@link useTestDocReview}.
 */
export function TestDocReviewPane({
  entry,
  splitPct,
  generating,
  docIsStale,
  conflictMessage,
  compare,
  editing,
  progress,
  onSwitchVersion,
  onToggleCompare,
  onToggleEdit,
  onGenerate,
  onDocChange,
  onPreviewClick,
}: TestDocReviewPaneProps) {
  return (
    <div className="flex min-h-0 flex-col gap-3 p-4" style={{ width: `${splitPct}%` }}>
      {entry.unstructured && !generating && (
        <InlineAlert variant="warning">
          The workspace returned unstructured output — review it carefully before saving.
        </InlineAlert>
      )}
      {entry.classification === "needs_input" && !generating && (
        <InlineAlert variant="warning">
          The story lacks enough context for meaningful test documentation (empty or
          template-only description). Complete the story first, or write the checks
          yourself below to enable saving.
        </InlineAlert>
      )}
      {/* A doc that exists but is NOT saved must be unmissable; a saved doc only
          gets a quiet provenance line (below, in the toolbar row) — the old
          explanatory banner said nothing (PO feedback). */}
      {(entry.source === "draft" || entry.source === "fresh") && !generating && entry.doc.trim() && (
        <InlineAlert variant="warning">
          Generated{entry.cachedAt ? ` ${new Date(entry.cachedAt).toLocaleString()}` : ""} — <strong>not saved yet</strong>.
          Save it to count for the sprint delivery.
        </InlineAlert>
      )}
      {!generating && docIsStale && (
        <InlineAlert variant="warning">
          The story content was updated{entry.storyUpdatedAt ? ` ${new Date(entry.storyUpdatedAt).toLocaleString()}` : ""} —
          AFTER this doc was made. Check whether it still covers the story, or Regenerate.
        </InlineAlert>
      )}
      {entry.error && <InlineAlert variant="error">{entry.error}</InlineAlert>}
      {conflictMessage && (
        <InlineAlert variant="warning">
          Saved in Bridge, but the Jira push hit a conflict: {conflictMessage} Resolve it
          from the ticket&apos;s description editor.
        </InlineAlert>
      )}
      {/* Toolbar: version chips (regenerations pile up next to the older doc;
          the PO switches, compares, then accepts ONE — Save discards the rest)
          plus the rendered/edit toggle. */}
      {entry.status === "ready" && (
        <div className="flex shrink-0 items-center gap-1.5" data-testid="test-doc-toolbar">
          {entry.source === "saved" && entry.cachedAt && (
            <span className="text-caption text-text-muted" data-testid="test-doc-saved-at">
              Saved {new Date(entry.cachedAt).toLocaleString()}
            </span>
          )}
          {entry.versions.length > 1 && (
            <span className="flex items-center gap-1.5" data-testid="test-doc-versions">
              {entry.versions.map((v, i) => (
                <button
                  key={`${i}-${v.label}`}
                  type="button"
                  onClick={() => onSwitchVersion(i)}
                  className={`cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                    i === entry.activeVersion
                      ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] ring-1 ring-[var(--color-brand-500)]/30"
                      : "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {entry.versions.length > 1 && (
              <button
                type="button"
                onClick={onToggleCompare}
                className="cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
              >
                {compare ? "Close compare" : "Compare"}
              </button>
            )}
            <button
              type="button"
              onClick={onToggleEdit}
              className="cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            >
              {editing ? "Preview" : "Edit"}
            </button>
          </span>
        </div>
      )}
      {entry.status === "idle" ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary"
          data-testid="test-doc-idle"
        >
          <p className="text-body-sm">No test documentation yet.</p>
          <Button variant="primary" size="md" onClick={onGenerate}>
            Generate test doc
          </Button>
        </div>
      ) : generating ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
          <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[var(--color-brand-400)]" />
          <p className="max-w-[320px] truncate text-body-sm" data-testid="test-doc-progress">
            {progress ?? "Starting..."}
          </p>
        </div>
      ) : compare && entry.versions.length > 1 ? (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto" data-testid="test-doc-compare">
          {entry.versions.map((v, i) => (
            <div
              key={`${i}-${v.label}`}
              className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-xl border ${
                i === entry.activeVersion ? "border-[var(--color-brand-500)]/45" : "border-border-subtle"
              } bg-surface-base`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-1.5">
                <span className="text-caption font-medium text-text-tertiary">{v.label}</span>
                {i !== entry.activeVersion && (
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(i)}
                    className="cursor-pointer text-caption font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    Use this one
                  </button>
                )}
              </div>
              <div className="description-content min-h-0 flex-1 overflow-y-auto p-3 text-body-sm">
                {renderMarkdown(i === entry.activeVersion ? entry.doc : v.doc)}
              </div>
            </div>
          ))}
        </div>
      ) : editing ? (
        <textarea
          value={entry.doc}
          onChange={(e) => onDocChange(e.target.value)}
          spellCheck={false}
          placeholder="Generated test documentation (markdown)..."
          data-testid="test-doc-editor"
          className="min-h-0 flex-1 resize-none rounded-xl border border-border-default bg-surface-base p-3 font-mono text-body-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]"
        />
      ) : (
        // Rendered markdown is the default reading mode; clicking it (or the
        // Edit toggle) switches to the raw editor.
        <div
          data-testid="test-doc-preview"
          onClick={onPreviewClick}
          title="Click to edit"
          className="description-content min-h-0 flex-1 cursor-pointer overflow-y-auto rounded-xl border border-border-subtle bg-surface-base p-3 text-body-sm"
        >
          {entry.doc.trim()
            ? renderMarkdown(entry.doc)
            : <p className="text-body-sm text-text-muted">Empty — click to write the checks yourself.</p>}
        </div>
      )}
    </div>
  );
}
